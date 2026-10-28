import { ZipArchive } from 'archiver';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ArchiveStatus, Photo } from '@prisma/client';
import { UnrecoverableError } from 'bullmq';
import { randomUUID } from 'node:crypto';
import { PassThrough } from 'node:stream';
import { finished } from 'node:stream/promises';
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

    const archive = await this.prisma.archive.findUnique({ where: { id: archiveId } });
    if (!archive) return;

    const storageKey = `archives/${archive.id}.zip`;
    try {
      const photos = await this.prisma.photo.findMany({
        where: { galleryId: archive.galleryId, status: 'READY', originalKey: { not: null } },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
      });
      if (!photos.length) throw new TerminalArchiveError('Gallery has no ready original photos');

      await this.ensureOriginalsExist(photos);
      await this.uploadArchive(storageKey, photos);

      const markedReady = await this.prisma.archive.updateMany({
        where: { id: archive.id, processingLockId: lockId, status: ArchiveStatus.PROCESSING },
        data: {
          storageKey,
          status: ArchiveStatus.READY,
          processingLockId: null,
          processingLockExpiresAt: null,
        },
      });
      if (markedReady.count === 0) await this.storage.delete(storageKey);
    } catch (error) {
      await this.cleanupPartialArchive(storageKey);
      await this.markFailed(archive.id, lockId);
      this.logger.error(`Archive generation failed for archive ${archive.id}`);

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
    const zip = new ZipArchive({ zlib: { level: 9 } });
    const upload = this.storage.upload({
      key: storageKey,
      body: output,
      contentType: 'application/zip',
    });
    const outputFinished = finished(output);

    zip.on('error', (error: Error) => output.destroy(error));
    zip.pipe(output);

    try {
      const names = new Set<string>();
      for (const photo of photos) {
        const original = await this.storage.download(photo.originalKey!);
        zip.append(original, { name: uniqueArchiveEntryName(photo.filename, names) });
      }

      await zip.finalize();
      await Promise.all([upload, outputFinished]);
    } catch (error) {
      zip.destroy();
      output.destroy(error instanceof Error ? error : new Error('Archive generation failed'));
      await Promise.allSettled([upload, outputFinished]);
      throw error;
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
      .trim() || 'photo';
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
