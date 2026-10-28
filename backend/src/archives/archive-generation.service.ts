import { ZipArchive } from 'archiver';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ArchiveStatus, Photo } from '@prisma/client';
import { UnrecoverableError } from 'bullmq';
import { randomUUID } from 'node:crypto';
import { PassThrough, Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { PrismaService } from '../prisma/prisma.service.js';
import type { GenerateArchiveJobData } from '../queues/queue.constants.js';
import { STORAGE_SERVICE } from '../storage/storage.service.js';
import type { StorageService } from '../storage/storage.service.js';
import { ARCHIVE_GENERATION_CONFIG } from './archive-generation.config.js';
import type { ArchiveGenerationConfig } from './archive-generation.config.js';

@Injectable()
export class ArchiveGenerationService {
  private readonly logger = new Logger(ArchiveGenerationService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORAGE_SERVICE) private readonly storage: StorageService,
    @Inject(ARCHIVE_GENERATION_CONFIG) private readonly config: ArchiveGenerationConfig,
  ) {}

  async process({ archiveId }: GenerateArchiveJobData): Promise<void> {
    const lockId = randomUUID();
    const lockClaim = await this.prisma.archive.updateMany({
      where: {
        id: archiveId,
        status: { in: [ArchiveStatus.PENDING, ArchiveStatus.PROCESSING, ArchiveStatus.FAILED] },
        OR: [{ processingLockExpiresAt: null }, { processingLockExpiresAt: { lte: new Date() } }],
      },
      data: {
        status: ArchiveStatus.PROCESSING,
        processingLockId: lockId,
        processingLockExpiresAt: new Date(Date.now() + this.config.lockTtlSeconds * 1000),
      },
    });
    if (lockClaim.count === 0) return;

    // Separate attempt keys prevent an expired worker from overwriting/deleting a newer result.
    const storageKey = `archives/${archiveId}-${lockId}.zip`;
    try {
      const archive = await this.prisma.archive.findUnique({ where: { id: archiveId } });
      if (!archive) return;
      const photos = await this.prisma.photo.findMany({
        where: { galleryId: archive.galleryId, status: 'READY', originalKey: { not: null } },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
      });
      if (!photos.length) throw new TerminalArchiveError('Gallery has no ready original photos');
      if (photos.reduce((size, photo) => size + photo.size, 0n) > BigInt(this.config.maxSize)) {
        throw new TerminalArchiveError('Gallery originals exceed the archive size limit');
      }

      await this.ensureOriginalsExist(photos);
      await this.uploadArchive(storageKey, photos);

      const markedReady = await this.prisma.archive.updateMany({
        where: { id: archive.id, processingLockId: lockId, status: ArchiveStatus.PROCESSING },
        data: {
          storageKey,
          status: ArchiveStatus.READY,
          expiresAt: new Date(Date.now() + this.config.retentionSeconds * 1000),
          processingLockId: null,
          processingLockExpiresAt: null,
        },
      });
      if (markedReady.count === 0) await this.storage.delete(storageKey);
    } catch (error) {
      await this.cleanupPartialArchive(storageKey);
      await this.markFailed(archiveId, lockId);
      this.logger.error({ event: 'archive_generation_failed', archiveId });

      if (error instanceof TerminalArchiveError) {
        throw new UnrecoverableError(error.message);
      }

      throw error;
    }
  }

  private async ensureOriginalsExist(photos: Photo[]): Promise<void> {
    for (const photo of photos) {
      if (!photo.originalKey || !(await this.storage.exists(photo.originalKey))) {
        throw new TerminalArchiveError('A ready photo original is missing');
      }
    }
  }

  private async uploadArchive(storageKey: string, photos: Photo[]): Promise<void> {
    const output = new PassThrough();
    // JPEG/WebP originals are already compressed; avoid spending CPU recompressing them.
    const zip = new ZipArchive({ store: true });
    const inputs = new Set<Readable>();
    let originalBytes = 0;
    let zipBytes = 0;
    let stopped: Error | undefined;
    const maxSize = this.config.maxSize;
    const storage = this.storage;
    const limit = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        zipBytes += chunk.length;
        callback(
          zipBytes > maxSize ? new TerminalArchiveError('ZIP exceeds the size limit') : null,
          chunk,
        );
      },
    });
    const stop = (error: Error) => {
      stopped ??= error;
      for (const input of inputs) input.destroy(error);
      zip.destroy(error);
      output.destroy(error);
    };
    const timeout = setTimeout(
      () => stop(new Error('Archive generation timed out')),
      this.config.lockTtlSeconds * 1000,
    );
    const transfer = pipeline(zip, limit, output);
    const upload = this.storage.upload({
      key: storageKey,
      body: output,
      contentType: 'application/zip',
    });
    // Attach rejection handlers immediately: storage can fail before ZIP finalization.
    const completion = Promise.all([transfer, upload]).catch((error: unknown) => {
      stop(error instanceof Error ? error : new Error('Archive transfer failed'));
      throw error;
    });
    void completion.catch(() => undefined);

    try {
      const names = new Set<string>();
      for (const photo of photos) {
        // Open one S3 response at a time, only when archiver consumes this entry.
        const entry = Readable.from(
          (async function* () {
            if (stopped) throw stopped;
            const original = await storage.download(photo.originalKey!);
            if (stopped) {
              original.destroy();
              throw stopped;
            }
            inputs.add(original);
            try {
              for await (const chunk of original) {
                const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
                originalBytes += bytes.length;
                if (originalBytes > maxSize)
                  throw new TerminalArchiveError('Originals exceed the size limit');
                yield bytes;
              }
            } finally {
              original.destroy();
              inputs.delete(original);
            }
          })(),
        );
        inputs.add(entry);
        entry.on('error', stop);
        entry.once('close', () => inputs.delete(entry));
        zip.append(entry, { name: uniqueArchiveEntryName(photo.filename, names) });
      }

      await Promise.all([zip.finalize(), completion]);
    } catch (error) {
      stop(error instanceof Error ? error : new Error('Archive generation failed'));
      await Promise.allSettled([transfer, upload]);
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  private async markFailed(archiveId: string, lockId: string): Promise<void> {
    await this.prisma.archive.updateMany({
      where: { id: archiveId, processingLockId: lockId, status: { not: ArchiveStatus.READY } },
      data: { status: ArchiveStatus.FAILED, processingLockId: null, processingLockExpiresAt: null },
    });
  }

  private async cleanupPartialArchive(storageKey: string): Promise<void> {
    try {
      await this.storage.delete(storageKey);
    } catch {
      this.logger.warn('Could not clean up an incomplete archive object');
    }
  }
}

function uniqueArchiveEntryName(filename: string, names: Set<string>): string {
  const safeFilename =
    Array.from(filename.replaceAll(/[\\/]/g, '_'))
      .map((character) => (character.charCodeAt(0) < 32 ? '_' : character))
      .join('')
      .trim()
      .replace(/^\.+$/, '_') || 'photo';
  if (!names.has(safeFilename)) {
    names.add(safeFilename);
    return safeFilename;
  }

  const lastDot = safeFilename.lastIndexOf('.');
  const stem = lastDot > 0 ? safeFilename.slice(0, lastDot) : safeFilename;
  const extension = lastDot > 0 ? safeFilename.slice(lastDot) : '';
  let index = 2;
  let candidate = `${stem} (${index})${extension}`;
  while (names.has(candidate)) {
    index += 1;
    candidate = `${stem} (${index})${extension}`;
  }
  names.add(candidate);
  return candidate;
}

class TerminalArchiveError extends Error {}
