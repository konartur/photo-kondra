import { Inject, Injectable, Logger } from '@nestjs/common';
import { Photo, PhotoStatus } from '@prisma/client';
import { UnrecoverableError } from 'bullmq';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { PrismaService } from '../prisma/prisma.service.js';
import type { ProcessPhotoJobData } from '../queues/queue.constants.js';
import { STORAGE_SERVICE } from '../storage/storage.service.js';
import type { StorageService } from '../storage/storage.service.js';
import { IMAGE_PROCESSING_CONFIG } from './image-processing.config.js';
import type { ImageProcessingConfig } from './image-processing.config.js';

@Injectable()
export class ImageProcessingService {
  private readonly logger = new Logger(ImageProcessingService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORAGE_SERVICE) private readonly storage: StorageService,
    @Inject(IMAGE_PROCESSING_CONFIG) private readonly config: ImageProcessingConfig,
  ) {}

  async process({ photoId }: ProcessPhotoJobData): Promise<void> {
    const lockId = randomUUID();
    const lockClaim = await this.prisma.photo.updateMany({
      where: {
        id: photoId,
        status: { in: [PhotoStatus.PROCESSING, PhotoStatus.FAILED, PhotoStatus.READY] },
        OR: [{ processingLockExpiresAt: null }, { processingLockExpiresAt: { lte: new Date() } }],
      },
      data: {
        processingLockId: lockId,
        processingLockExpiresAt: new Date(Date.now() + this.config.lockTtlSeconds * 1000),
      },
    });

    if (lockClaim.count === 0) return;

    const photo = await this.prisma.photo.findUnique({ where: { id: photoId } });
    if (!photo || photo.status === PhotoStatus.DELETED) return;
    if (this.isAlreadyProcessed(photo)) {
      await this.releaseLock(photo.id, lockId);
      return;
    }

    try {
      await this.processPhoto(photo, lockId);
    } catch (error) {
      await this.cleanupDerivatives(photo);
      await this.markFailed(photo.id, lockId);
      this.logger.error(`Image processing failed for photo ${photo.id}`);

      if (error instanceof TerminalProcessingError) {
        throw new UnrecoverableError(error.message);
      }

      throw error;
    }
  }

  private async processPhoto(photo: Photo, lockId: string): Promise<void> {
    if (!photo.originalKey) throw new TerminalProcessingError('Photo original key is missing');
    if (!(await this.storage.exists(photo.originalKey))) {
      throw new TerminalProcessingError('Photo original object is missing');
    }

    const original = await this.storage.download(photo.originalKey);
    const image = sharp().rotate();
    original.pipe(image);

    const thumbnailKey = `galleries/${photo.galleryId}/thumbnails/${photo.id}.webp`;
    const previewKey = `galleries/${photo.galleryId}/previews/${photo.id}.webp`;
    let width: number;
    let height: number;
    let thumbnail: Buffer;
    let preview: Buffer;
    try {
      const metadata = await image.metadata();
      if (!metadata.width || !metadata.height) {
        throw new Error('Image dimensions could not be determined');
      }
      width = metadata.width;
      height = metadata.height;
      [thumbnail, preview] = await Promise.all([
        image
          .clone()
          .resize({ width: this.config.thumbnailWidth, withoutEnlargement: true })
          .webp()
          .toBuffer(),
        image
          .clone()
          .resize({ width: this.config.previewWidth, withoutEnlargement: true })
          .webp()
          .toBuffer(),
      ]);
    } catch {
      throw new TerminalProcessingError('Photo original is malformed or cannot be processed');
    }

    await Promise.all([
      this.storage.upload({ key: thumbnailKey, body: thumbnail, contentType: 'image/webp' }),
      this.storage.upload({ key: previewKey, body: preview, contentType: 'image/webp' }),
    ]);
    const updated = await this.prisma.photo.updateMany({
      where: { id: photo.id, processingLockId: lockId, status: { not: PhotoStatus.DELETED } },
      data: {
        width,
        height,
        thumbnailKey,
        previewKey,
        status: PhotoStatus.READY,
        processingLockId: null,
        processingLockExpiresAt: null,
      },
    });

    if (updated.count === 0) {
      await this.cleanupDerivativeKeys([thumbnailKey, previewKey]);
    }
  }

  private async markFailed(photoId: string, lockId: string): Promise<void> {
    await this.prisma.photo.updateMany({
      where: { id: photoId, processingLockId: lockId, status: { not: PhotoStatus.DELETED } },
      data: {
        status: PhotoStatus.FAILED,
        width: null,
        height: null,
        thumbnailKey: null,
        previewKey: null,
        processingLockId: null,
        processingLockExpiresAt: null,
      },
    });
  }

  private async releaseLock(photoId: string, lockId: string): Promise<void> {
    await this.prisma.photo.updateMany({
      where: { id: photoId, processingLockId: lockId },
      data: { processingLockId: null, processingLockExpiresAt: null },
    });
  }

  private async cleanupDerivatives(photo: Photo): Promise<void> {
    await this.cleanupDerivativeKeys([
      `galleries/${photo.galleryId}/thumbnails/${photo.id}.webp`,
      `galleries/${photo.galleryId}/previews/${photo.id}.webp`,
    ]);
  }

  private async cleanupDerivativeKeys(keys: string[]): Promise<void> {
    const results = await Promise.allSettled(keys.map((key) => this.storage.delete(key)));
    if (results.some((result) => result.status === 'rejected')) {
      this.logger.warn('Could not clean up one or more incomplete image derivatives');
    }
  }

  private isAlreadyProcessed(photo: Photo): boolean {
    return (
      photo.status === PhotoStatus.READY &&
      photo.width !== null &&
      photo.height !== null &&
      photo.thumbnailKey !== null &&
      photo.previewKey !== null
    );
  }
}

class TerminalProcessingError extends Error {}
