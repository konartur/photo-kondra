import { ZipArchive } from 'archiver';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ArchiveStatus, Photo } from '@prisma/client';
import { UnrecoverableError } from 'bullmq';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { PassThrough, Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { PrismaService } from '../prisma/prisma.service.js';
import type { GenerateArchiveJobData } from '../queues/queue.constants.js';
import { STORAGE_SERVICE } from '../storage/storage.service.js';
import type { StorageService } from '../storage/storage.service.js';
import { ARCHIVE_GENERATION_CONFIG } from './archive-generation.config.js';
import type { ArchiveGenerationConfig } from './archive-generation.config.js';
import { ArchiveProgressTracker } from './archive-progress.js';
import { ArchiveLeaseBusyError } from './archive-lease-busy.error.js';
import { archiveContentHash } from './archive-content.js';
import type { ArchiveProgress } from './archive-progress.js';

@Injectable()
export class ArchiveGenerationService {
  private readonly logger = new Logger(ArchiveGenerationService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORAGE_SERVICE) private readonly storage: StorageService,
    @Inject(ARCHIVE_GENERATION_CONFIG) private readonly config: ArchiveGenerationConfig,
  ) {}

  async process(
    { archiveId }: GenerateArchiveJobData,
    report?: (progress: ArchiveProgress) => Promise<void>,
  ): Promise<void> {
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
    if (lockClaim.count === 0) {
      const existing = await this.prisma.archive.findUnique({ where: { id: archiveId } });
      if (!existing || existing.status === ArchiveStatus.READY) return;
      throw new ArchiveLeaseBusyError(
        Math.max(Date.now() + 5000, existing.processingLockExpiresAt?.getTime() ?? 0),
      );
    }

    // Separate attempt keys prevent an expired worker from overwriting/deleting a newer result.
    const storageKey = `archives/${archiveId}-${lockId}.zip`;
    let progress: ArchiveProgressTracker | undefined;
    try {
      const archive = await this.prisma.archive.findUnique({ where: { id: archiveId } });
      if (!archive) return;
      const photos = await this.prisma.photo.findMany({
        where: { galleryId: archive.galleryId, status: 'READY', originalKey: { not: null } },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
      });
      if (!photos.length) throw new TerminalArchiveError('Gallery has no ready original photos');
      if (archive.contentHash && archive.contentHash !== archiveContentHash(photos)) {
        throw new TerminalArchiveError('Gallery content changed; request a new archive');
      }
      if (photos.reduce((size, photo) => size + photo.size, 0n) > BigInt(this.config.maxSize)) {
        throw new TerminalArchiveError('Gallery originals exceed the archive size limit');
      }

      await this.ensureOriginalsExist(photos);
      progress = new ArchiveProgressTracker(
        Number(photos.reduce((sum, photo) => sum + photo.size, 0n)),
        async (value) => {
          this.logger.log({ event: 'archive_progress', archiveId, ...value });
          try {
            await report?.(value);
          } catch {
            this.logger.warn({ event: 'archive_progress_publish_failed', archiveId });
          }
        },
      );
      progress.start();
      await progress.publish();
      await this.uploadArchive(storageKey, photos, archiveId, progress);
      if (archive.contentHash) {
        const currentPhotos = await this.prisma.photo.findMany({
          where: { galleryId: archive.galleryId, status: 'READY', originalKey: { not: null } },
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
        });
        if (archive.contentHash !== archiveContentHash(currentPhotos)) {
          throw new TerminalArchiveError('Gallery content changed; request a new archive');
        }
      }
      progress.phase = 'publishing';
      await progress.publish();

      const markedReady = await this.prisma.$transaction(async (tx) => {
        const gallery = await tx.gallery.findUnique({ where: { id: archive.galleryId } });
        const publishing = gallery?.status === 'PROCESSING';
        if (publishing) {
          await tx.gallery.update({
            where: { id: archive.galleryId, status: 'PROCESSING' },
            data: { status: 'READY' },
          });
          const current = await tx.photo.findMany({
            where: { galleryId: archive.galleryId, status: 'READY', originalKey: { not: null } },
            orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
          });
          if (!archive.contentHash || archiveContentHash(current) !== archive.contentHash)
            throw new TerminalArchiveError('Gallery content changed before publication');
        }
        const result = await tx.archive.updateMany({
          where: { id: archive.id, processingLockId: lockId, status: ArchiveStatus.PROCESSING },
          data: {
            storageKey,
            status: ArchiveStatus.READY,
            expiresAt:
              publishing || this.config.retentionSeconds === 0
                ? null
                : new Date(Date.now() + this.config.retentionSeconds * 1000),
            processingLockId: null,
            processingLockExpiresAt: null,
          },
        });
        if (!result.count && publishing) throw new ArchiveLeaseBusyError(Date.now() + 5000);
        return result;
      });
      if (markedReady.count === 0) await this.storage.delete(storageKey);
      else {
        await progress.stop();
        progress.phase = 'ready';
        await progress.publish();
      }
    } catch (error) {
      if (progress) {
        await progress.stop();
        progress.phase = 'failed';
        await progress.publish();
      }
      await this.cleanupPartialArchive(storageKey);
      await this.markFailed(archiveId, lockId);
      this.logger.error({
        event: 'archive_generation_failed',
        archiveId,
        ...safeErrorDetails(error),
      });

      if (error instanceof TerminalArchiveError) {
        throw new UnrecoverableError(error.message);
      }

      throw error;
    } finally {
      await progress?.stop();
    }
  }

  private async ensureOriginalsExist(photos: Photo[]): Promise<void> {
    for (const photo of photos) {
      if (!photo.originalKey || !(await this.storage.exists(photo.originalKey))) {
        throw new TerminalArchiveError('A ready photo original is missing');
      }
    }
  }

  private async uploadArchive(
    storageKey: string,
    photos: Photo[],
    archiveId: string,
    progress: ArchiveProgressTracker,
  ): Promise<void> {
    const output = new PassThrough();
    // JPEG/WebP originals are already compressed; avoid spending CPU recompressing them.
    const zip = new ZipArchive({ store: true });
    const inputs = new Set<Readable>();
    let originalBytes = 0;
    let zipBytes = 0;
    let stopped: Error | undefined;
    const maxSize = this.config.maxSize;
    const storage = this.storage;
    const logger = this.logger;
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
      onProgress: (bytes) => progress.uploaded(bytes),
    });
    void transfer
      .then(() => {
        progress.totalZipBytes = zipBytes;
      })
      .catch(() => undefined);
    // Never open the next S3 body until archiver has fully processed this entry.
    // append() pipes its source immediately, even before that entry reaches the ZIP queue.
    // Attach rejection handlers immediately: storage can fail before ZIP finalization.
    const completion = Promise.all([transfer, upload]).catch((error: unknown) => {
      stop(error instanceof Error ? error : new Error('Archive transfer failed'));
      throw error;
    });
    void completion.catch(() => undefined);

    try {
      const names = new Set<string>();
      for (const photo of photos) {
        progress.beginPhoto(photo.id, Number(photo.size));
        logger.log({ event: 'archive_photo_started', archiveId, photoId: photo.id });
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
                progress.read(bytes.length);
                if (originalBytes > maxSize)
                  throw new TerminalArchiveError('Originals exceed the size limit');
                yield bytes;
              }
            } catch (error) {
              logger.error({
                event: 'archive_photo_read_failed',
                archiveId,
                photoId: photo.id,
                ...safeErrorDetails(error),
              });
              throw error;
            } finally {
              original.destroy();
              inputs.delete(original);
            }
          })(),
        );
        inputs.add(entry);
        entry.on('error', stop);
        entry.once('close', () => inputs.delete(entry));
        const entryFinished = once(zip, 'entry');
        zip.append(entry, { name: uniqueArchiveEntryName(photo.filename, names) });
        await Promise.race([entryFinished, completion]);
        logger.log({
          event: 'archive_photo_completed',
          archiveId,
          photoId: photo.id,
          originalBytes,
        });
      }

      await Promise.all([zip.finalize(), completion]);
      progress.totalZipBytes = zipBytes;
      progress.uploaded(zipBytes);
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

function safeErrorDetails(error: unknown): { errorName: string; errorCode?: string } {
  const code =
    typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined;
  return {
    errorName: error instanceof Error ? error.name : 'UnknownError',
    ...(typeof code === 'string' && /^[A-Za-z0-9_:-]{1,80}$/.test(code) ? { errorCode: code } : {}),
  };
}
