import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import type { PortfolioMedia } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { STORAGE_SERVICE } from '../../storage/storage.service.js';
import type { StorageService } from '../../storage/storage.service.js';
import { signedUrlLimits, validateSignedUrlTtl } from '../../storage/signed-url-policy.js';
import { AppLogger, safeErrorDetails } from '../../common/logging/app-logger.js';
import { PortfolioPersistenceService } from '../persistence/portfolio-persistence.service.js';
import { RequestPortfolioUploadDto } from '../dto/admin-input.dto.js';
import {
  AdminPortfolioMediaDto,
  AdminPortfolioMediaListDto,
  PortfolioUploadResponseDto,
} from '../dto/admin-response.dto.js';
import { PortfolioListQueryDto } from '../dto/query.dto.js';
import { PORTFOLIO_MAX_UPLOAD_BYTES } from '../dto/shared.dto.js';
import { PortfolioMediaJobs } from './portfolio-media.jobs.js';
import { PortfolioMediaCleanupService } from './portfolio-media-cleanup.service.js';
import { decodeMediaCursor, encodeMediaCursor } from './portfolio-media-cursor.js';
import { assertPortfolioKey } from './portfolio-media.config.js';

function notFound() {
  return new NotFoundException({
    code: 'PORTFOLIO_CONTENT_NOT_FOUND',
    message: 'Portfolio media not found',
  });
}

@Injectable()
export class PortfolioMediaService {
  private readonly logger = new AppLogger(PortfolioMediaService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly persistence: PortfolioPersistenceService,
    @Inject(STORAGE_SERVICE) private readonly storage: StorageService,
    private readonly jobs: PortfolioMediaJobs,
    private readonly cleanup: PortfolioMediaCleanupService,
    private readonly config: ConfigService,
  ) {}

  async requestUpload(
    ownerId: string,
    dto: RequestPortfolioUploadDto,
  ): Promise<PortfolioUploadResponseDto> {
    const extensions: Record<string, string> = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
    };
    if (
      !Object.hasOwn(extensions, dto.mimeType) ||
      !Number.isSafeInteger(dto.sizeBytes) ||
      dto.sizeBytes < 1 ||
      dto.sizeBytes > PORTFOLIO_MAX_UPLOAD_BYTES
    )
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: 'Invalid portfolio upload metadata',
      });
    const mediaId = randomUUID();
    const originalKey = `portfolio/media/${mediaId}/original.${extensions[dto.mimeType]}`;
    const expiresIn = this.ttl('SIGNED_URL_UPLOAD_TTL', signedUrlLimits.upload);
    const uploadUrl = await this.storage.createUploadUrl({
      key: originalKey,
      contentType: dto.mimeType,
      expiresIn,
      contentLength: dto.sizeBytes,
    });
    await this.persistence.withContentLock((tx) =>
      tx.portfolioMedia.create({
        data: {
          id: mediaId,
          uploadedById: ownerId,
          originalKey,
          filename: dto.filename,
          mimeType: dto.mimeType,
          sizeBytes: BigInt(dto.sizeBytes),
        },
      }),
    );
    this.logger.log({ event: 'portfolio_media_upload_created', mediaId, userId: ownerId });
    return {
      mediaId,
      uploadUrl,
      expiresIn,
      requiredHeaders: { 'Content-Type': dto.mimeType, 'If-None-Match': '*' },
    };
  }

  async complete(ownerId: string, mediaId: string): Promise<AdminPortfolioMediaDto> {
    const current = await this.owned(ownerId, mediaId);
    if (current.status === 'UPLOADING') {
      if (!current.originalKey || !(await this.storage.exists(current.originalKey)))
        throw new BadRequestException({
          code: 'VALIDATION_FAILED',
          message: 'Uploaded portfolio object was not found',
        });
      await this.persistence.withContentLock(async (tx) => {
        const media = await this.owned(ownerId, mediaId, tx);
        if (media.status === 'UPLOADING')
          await tx.portfolioMedia.update({
            where: { id: mediaId },
            data: { status: 'PROCESSING' },
          });
      });
      this.logger.log({ event: 'portfolio_media_upload_completed', mediaId, userId: ownerId });
    }
    const media = await this.owned(ownerId, mediaId);
    if (media.status === 'PROCESSING' && !media.processingLockId) await this.enqueue(mediaId);
    return this.detail(ownerId, mediaId);
  }

  async retry(ownerId: string, mediaId: string): Promise<AdminPortfolioMediaDto> {
    const media = await this.persistence.withContentLock(async (tx) => {
      const current = await this.owned(ownerId, mediaId, tx);
      if (current.status === 'UPLOADING')
        throw new ConflictException({
          code: 'PORTFOLIO_NOT_READY',
          message: 'Complete the upload before retrying',
        });
      if (current.status === 'FAILED')
        return tx.portfolioMedia.update({
          where: { id: mediaId },
          data: { status: 'PROCESSING', processingLockId: null, processingLockExpiresAt: null },
        });
      return current;
    });
    if (
      media.status === 'PROCESSING' &&
      (!media.processingLockExpiresAt || media.processingLockExpiresAt.getTime() <= Date.now())
    )
      await this.enqueue(mediaId);
    return this.detail(ownerId, mediaId);
  }

  async detail(ownerId: string, mediaId: string): Promise<AdminPortfolioMediaDto> {
    const media = await this.prisma.portfolioMedia.findFirst({
      where: { id: mediaId, uploadedById: ownerId, status: { not: 'DELETED' } },
      include: { variants: { orderBy: { width: 'desc' }, take: 1 } },
    });
    if (!media) throw notFound();
    return mediaResponse(media, media.variants[0]?.id);
  }

  async list(
    ownerId: string,
    { limit, cursor }: PortfolioListQueryDto,
  ): Promise<AdminPortfolioMediaListDto> {
    const secret = this.config.getOrThrow<string>('JWT_ACCESS_SECRET');
    const after = cursor ? decodeMediaCursor(cursor, secret, ownerId, limit) : null;
    return this.prisma.$transaction(
      async (tx) => {
        const state = await tx.portfolioContentState.findUniqueOrThrow({ where: { id: 1 } });
        if (after && after.contentVersion !== state.contentVersion.toString())
          throw new ConflictException({
            code: 'PORTFOLIO_CURSOR_STALE',
            message: 'Portfolio cursor version changed',
          });
        const asOf = after?.asOf ?? new Date().toISOString();
        const rows = await tx.portfolioMedia.findMany({
          where: {
            uploadedById: ownerId,
            status: { not: 'DELETED' },
            createdAt: { lte: new Date(asOf) },
            ...(after
              ? {
                  OR: [
                    { createdAt: { lt: new Date(after.createdAt) } },
                    { createdAt: new Date(after.createdAt), id: { lt: after.id } },
                  ],
                }
              : {}),
          },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: limit + 1,
          include: { variants: { orderBy: { width: 'desc' }, take: 1 } },
        });
        const items = rows.slice(0, limit);
        const last = items.at(-1);
        return {
          items: items.map((media) => mediaResponse(media, media.variants[0]?.id)),
          nextCursor:
            rows.length > limit && last
              ? encodeMediaCursor(
                  {
                    v: 1,
                    ownerId,
                    limit,
                    contentVersion: state.contentVersion.toString(),
                    asOf,
                    createdAt: last.createdAt.toISOString(),
                    id: last.id,
                  },
                  secret,
                )
              : null,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  async preview(ownerId: string, mediaId: string, variantId: string): Promise<string> {
    const variant = await this.prisma.portfolioMediaVariant.findFirst({
      where: { id: variantId, mediaId, media: { uploadedById: ownerId, status: 'READY' } },
    });
    if (!variant) throw notFound();
    assertPortfolioKey(mediaId, variant.key);
    return this.storage.createDownloadUrl({
      key: variant.key,
      expiresIn: this.ttl('SIGNED_URL_PREVIEW_TTL', signedUrlLimits.preview),
      cacheControl: 'private, no-store',
    });
  }

  async remove(ownerId: string, mediaId: string): Promise<void> {
    await this.persistence.withContentLock(async (tx) => {
      const media = await tx.portfolioMedia.findFirst({
        where: { id: mediaId, uploadedById: ownerId },
      });
      if (!media) throw notFound();
      if (media.status === 'DELETED') return;
      const referenced = await tx.portfolioMedia.count({
        where: {
          id: mediaId,
          OR: [
            { serviceCards: { some: {} } },
            { serviceShares: { some: {} } },
            { storyCovers: { some: {} } },
            { storyShares: { some: {} } },
            { storyPhotos: { some: {} } },
            { desktopHeroes: { some: {} } },
            { mobileHeroes: { some: {} } },
            { contactBackgrounds: { some: {} } },
            { homeShares: { some: {} } },
            { featuredImages: { some: {} } },
            { publishedReferences: { some: {} } },
          ],
        },
      });
      if (referenced)
        throw new ConflictException({
          code: 'PORTFOLIO_CONTENT_REFERENCED',
          message: 'Portfolio media is referenced',
        });
      await tx.portfolioMedia.update({
        where: { id: mediaId },
        data: { status: 'DELETED', processingLockId: null, processingLockExpiresAt: null },
      });
    });
    try {
      await this.cleanup.clean(mediaId);
    } catch {
      this.logger.warn({ event: 'portfolio_media_cleanup_deferred', mediaId });
    }
    this.logger.log({ event: 'portfolio_media_deleted', mediaId, userId: ownerId });
  }

  private async owned(
    ownerId: string,
    mediaId: string,
    db: Prisma.TransactionClient = this.prisma,
  ) {
    const media = await db.portfolioMedia.findFirst({
      where: { id: mediaId, uploadedById: ownerId, status: { not: 'DELETED' } },
    });
    if (!media) throw notFound();
    return media;
  }
  private async enqueue(mediaId: string) {
    try {
      await this.jobs.ensureQueued(mediaId);
    } catch (error) {
      this.logger.error({
        event: 'job_enqueue_failed',
        mediaId,
        queue: 'portfolio-media-processing',
        ...safeErrorDetails(error),
      });
      throw new ServiceUnavailableException('Portfolio processing queue unavailable');
    }
  }
  private ttl(key: string, maximum: number): number {
    return validateSignedUrlTtl(Number(this.config.getOrThrow<string>(key)), maximum);
  }
}

function mediaResponse(media: PortfolioMedia, variantId?: string): AdminPortfolioMediaDto {
  return {
    id: media.id,
    filename: media.filename,
    mimeType: media.mimeType,
    sizeBytes: media.sizeBytes.toString(),
    width: media.width,
    height: media.height,
    status: media.status,
    createdAt: media.createdAt.toISOString(),
    previewUrl:
      media.status === 'READY' && variantId
        ? `/api/portfolio/media/${media.id}/variants/${variantId}`
        : null,
  };
}
