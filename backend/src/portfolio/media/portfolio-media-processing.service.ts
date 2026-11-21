import { Inject, Injectable } from '@nestjs/common';
import { createReadStream } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { UnrecoverableError } from 'bullmq';
import type { Prisma } from '@prisma/client';
import { STORAGE_SERVICE } from '../../storage/storage.service.js';
import type { StorageService } from '../../storage/storage.service.js';
import { AppLogger, safeErrorDetails } from '../../common/logging/app-logger.js';
import { PortfolioPersistenceService } from '../persistence/portfolio-persistence.service.js';
import { PortfolioImageProcessor } from './portfolio-image-processor.js';
import type { PreparedPortfolioImage } from './portfolio-image-processor.js';
import {
  PORTFOLIO_MEDIA_CONFIG,
  PortfolioMediaClaimLostError,
  PortfolioMediaLeaseBusyError,
  TerminalPortfolioMediaError,
  assertPortfolioKey,
} from './portfolio-media.config.js';
import type { PortfolioMediaConfig, PortfolioMediaJobData } from './portfolio-media.config.js';

@Injectable()
export class PortfolioMediaProcessingService {
  private readonly logger = new AppLogger(PortfolioMediaProcessingService.name);
  constructor(
    private readonly persistence: PortfolioPersistenceService,
    private readonly processor: PortfolioImageProcessor,
    @Inject(STORAGE_SERVICE) private readonly storage: StorageService,
    @Inject(PORTFOLIO_MEDIA_CONFIG) private readonly config: PortfolioMediaConfig,
  ) {}

  async process({ mediaId }: PortfolioMediaJobData): Promise<void> {
    const lockId = randomUUID();
    const media = await this.persistence.withContentLock(async (tx) => {
      const current = await tx.portfolioMedia.findUnique({
        where: { id: mediaId },
        include: { variants: true },
      });
      if (
        !current ||
        current.status === 'DELETED' ||
        current.status === 'READY' ||
        current.status === 'UPLOADING'
      )
        return null;
      if (current.processingLockExpiresAt && current.processingLockExpiresAt.getTime() > Date.now())
        throw new PortfolioMediaLeaseBusyError(current.processingLockExpiresAt.getTime());
      await tx.portfolioMedia.update({
        where: { id: mediaId },
        data: {
          status: 'PROCESSING',
          processingLockId: lockId,
          processingLockExpiresAt: new Date(Date.now() + this.config.lockTtlSeconds * 1000),
        },
      });
      return current;
    });
    if (!media) return;
    const controller = new AbortController();
    const deadline = setTimeout(() => {
      const error = new Error('Portfolio media processing timed out');
      error.name = 'TimeoutError';
      controller.abort(error);
    }, this.config.processingTimeoutSeconds * 1000);
    deadline.unref();
    let prepared: PreparedPortfolioImage | undefined;
    let planned: { id: string; key: string; width: number; height: number; path: string }[] = [];
    this.logger.log({ event: 'portfolio_media_processing_started', mediaId });
    try {
      // Failed/stalled attempts have durable planned rows. Remove old objects before
      // reusing the unique media/width slots; new keys include this attempt's lease.
      for (const variant of media.variants) {
        assertPortfolioKey(mediaId, variant.key);
        await this.storage.delete(variant.key, controller.signal);
      }
      prepared = await this.processor.prepare(media, controller.signal);
      planned = prepared.variants.map((variant) => ({
        ...variant,
        id: randomUUID(),
        key: `portfolio/media/${mediaId}/variants/${lockId}/${variant.width}.webp`,
      }));
      await this.persistence.withContentLock(async (tx) => {
        await this.assertClaim(tx, mediaId, lockId);
        await tx.portfolioMediaVariant.deleteMany({ where: { mediaId } });
        await tx.portfolioMediaVariant.createMany({
          data: planned.map(({ id, key, width, height }) => ({
            id,
            key,
            width,
            height,
            mediaId,
            format: 'webp',
          })),
        });
      });
      for (const variant of planned) {
        controller.signal.throwIfAborted();
        const body = createReadStream(variant.path);
        try {
          await this.storage.upload({
            key: variant.key,
            body,
            contentType: 'image/webp',
            cacheControl: 'private, no-store',
            signal: controller.signal,
          });
        } finally {
          body.destroy();
        }
      }
      controller.signal.throwIfAborted();
      const dimensions = { width: prepared.width, height: prepared.height };
      await this.persistence.withContentLock(async (tx) => {
        await this.assertClaim(tx, mediaId, lockId);
        await tx.portfolioMedia.update({
          where: { id: mediaId },
          data: {
            ...dimensions,
            status: 'READY',
            processingLockId: null,
            processingLockExpiresAt: null,
          },
        });
      });
      this.logger.log({ event: 'portfolio_media_processing_completed', mediaId });
    } catch (error) {
      // A connection error can occur after the READY commit. Never delete a result
      // until a DB read confirms it is not the published result of this attempt.
      let canClean = false;
      try {
        canClean = await this.persistence.withContentLock(async (tx) => {
          const current = await tx.portfolioMedia.findUnique({
            where: { id: mediaId },
            include: { variants: true },
          });
          if (
            current?.status === 'READY' &&
            current.variants.some((variant) => planned.some((item) => item.key === variant.key))
          )
            return false;
          await tx.portfolioMedia.updateMany({
            where: { id: mediaId, status: 'PROCESSING', processingLockId: lockId },
            data: {
              status: 'FAILED',
              width: null,
              height: null,
              processingLockId: null,
              processingLockExpiresAt: null,
            },
          });
          return true;
        });
      } catch {
        this.logger.warn({ event: 'portfolio_media_cleanup_deferred', mediaId });
      }
      if (canClean) {
        for (const variant of planned) {
          try {
            await this.storage.delete(variant.key, AbortSignal.timeout(10_000));
          } catch {
            this.logger.warn({ event: 'portfolio_media_cleanup_deferred', mediaId });
          }
        }
      }
      this.logger.error({
        event: 'portfolio_media_processing_failed',
        mediaId,
        ...safeErrorDetails(error),
      });
      if (error instanceof TerminalPortfolioMediaError) throw new UnrecoverableError(error.message);
      throw error;
    } finally {
      clearTimeout(deadline);
      try {
        await prepared?.cleanup();
      } catch {
        this.logger.warn({ event: 'portfolio_media_cleanup_deferred', mediaId });
      }
    }
  }

  private async assertClaim(
    tx: Prisma.TransactionClient,
    id: string,
    processingLockId: string,
  ): Promise<void> {
    const owned = await tx.portfolioMedia.count({
      where: {
        id,
        status: 'PROCESSING',
        processingLockId,
        processingLockExpiresAt: { gt: new Date() },
      },
    });
    if (owned !== 1) throw new PortfolioMediaClaimLostError();
  }
}
