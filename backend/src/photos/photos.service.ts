import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { randomUUID } from 'node:crypto';
import { Photo, PhotoStatus, Prisma } from '@prisma/client';
import { GalleriesService } from '../galleries/galleries.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { IMAGE_PROCESSING_QUEUE, PROCESS_PHOTO_JOB_NAME } from '../queues/queue.constants.js';
import { STORAGE_SERVICE } from '../storage/storage.service.js';
import type { StorageService } from '../storage/storage.service.js';
import { ListPhotosQueryDto } from './dto/list-photos-query.dto.js';
import { PhotoListResponseDto, PhotoResponseDto } from './dto/photo-response.dto.js';
import { UpdatePhotoDto } from './dto/update-photo.dto.js';
import {
  RequestPhotoUploadDto,
  RequestPhotoUploadResponseDto,
} from './dto/request-photo-upload.dto.js';
import { PHOTO_MIME_EXTENSIONS } from './photo-upload.constants.js';

@Injectable()
export class PhotosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly galleriesService: GalleriesService,
    @Inject(STORAGE_SERVICE) private readonly storage: StorageService,
    @Inject(IMAGE_PROCESSING_QUEUE) private readonly imageProcessingQueue: Queue,
    private readonly configService: ConfigService,
  ) {}

  async requestUpload(
    ownerId: string,
    galleryId: string,
    dto: RequestPhotoUploadDto,
  ): Promise<RequestPhotoUploadResponseDto> {
    await this.galleriesService.findOne(ownerId, galleryId);
    this.validateSize(dto.size);

    const photoId = randomUUID();
    const originalKey = `galleries/${galleryId}/originals/${photoId}.${PHOTO_MIME_EXTENSIONS[dto.mimeType]}`;
    const expiresIn = this.getPositiveIntegerConfig('SIGNED_URL_UPLOAD_TTL');
    const uploadUrl = await this.storage.createUploadUrl({
      key: originalKey,
      contentType: dto.mimeType,
      expiresIn,
    });

    await this.mutateDraft(galleryId, (tx) =>
      tx.photo.create({
        data: {
          id: photoId,
          galleryId,
          originalKey,
          filename: dto.filename,
          mimeType: dto.mimeType,
          size: BigInt(dto.size),
          status: PhotoStatus.UPLOADING,
        },
      }),
    );

    return { photoId, uploadUrl, expiresIn };
  }

  async completeUpload(ownerId: string, photoId: string): Promise<PhotoResponseDto> {
    const photo = await this.findOne(ownerId, photoId);

    if (photo.status !== PhotoStatus.UPLOADING) {
      throw new ConflictException('Photo upload has already been completed');
    }

    if (!photo.originalKey || !(await this.storage.exists(photo.originalKey))) {
      throw new BadRequestException('Uploaded object was not found');
    }

    const updatedPhoto = await this.mutateDraft(photo.galleryId, (tx) =>
      tx.photo.update({
        where: { id: photoId },
        data: { status: PhotoStatus.PROCESSING },
      }),
    );

    await this.imageProcessingQueue.add(PROCESS_PHOTO_JOB_NAME, { photoId });

    return toPhotoResponse(updatedPhoto);
  }

  async findAll(
    ownerId: string,
    galleryId: string,
    { limit, cursor }: ListPhotosQueryDto,
  ): Promise<PhotoListResponseDto> {
    await this.galleriesService.findOne(ownerId, galleryId);

    const photos = await this.prisma.photo.findMany({
      where: { galleryId, status: { not: PhotoStatus.DELETED } },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
      take: limit + 1,
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
    });
    const hasMore = photos.length > limit;
    const items = (hasMore ? photos.slice(0, limit) : photos).map(toPhotoResponse);

    return {
      items,
      nextCursor: hasMore ? (items.at(-1)?.id ?? null) : null,
    };
  }

  async update(ownerId: string, photoId: string, dto: UpdatePhotoDto): Promise<PhotoResponseDto> {
    const existing = await this.findOne(ownerId, photoId);

    const photo = await this.mutateDraft(existing.galleryId, (tx) =>
      tx.photo.update({
        where: { id: photoId },
        data: { sortOrder: dto.sortOrder },
      }),
    );

    return toPhotoResponse(photo);
  }

  async remove(ownerId: string, photoId: string): Promise<void> {
    const photo = await this.findOne(ownerId, photoId);
    const keys = [photo.originalKey, photo.previewKey, photo.thumbnailKey].filter(
      (key): key is string => key !== null,
    );

    await this.mutateDraft(photo.galleryId, (tx) =>
      tx.photo.update({
        where: { id: photoId },
        data: {
          status: PhotoStatus.DELETED,
          processingLockId: null,
          processingLockExpiresAt: null,
        },
      }),
    );
    await Promise.all(keys.map((key) => this.storage.delete(key)));
  }

  private async mutateDraft<T>(
    galleryId: string,
    change: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      const claimed = await tx.gallery.updateMany({
        where: { id: galleryId, status: 'DRAFT' },
        data: { updatedAt: new Date() },
      });
      if (!claimed.count)
        throw new ConflictException('Return gallery to draft before changing photos');
      return change(tx);
    });
  }

  private async findOne(ownerId: string, photoId: string): Promise<Photo> {
    const photo = await this.prisma.photo.findFirst({
      where: {
        id: photoId,
        status: { not: PhotoStatus.DELETED },
        gallery: { ownerId },
      },
    });

    if (!photo) throw new NotFoundException('Photo not found');

    return photo;
  }

  private validateSize(size: number): void {
    if (size > this.getPositiveIntegerConfig('MAX_PHOTO_SIZE')) {
      throw new BadRequestException('Photo exceeds the maximum allowed size');
    }
  }

  private getPositiveIntegerConfig(key: string): number {
    const value = Number(this.configService.getOrThrow<string>(key));

    if (!Number.isSafeInteger(value) || value <= 0) {
      throw new ServiceUnavailableException(`Invalid ${key} configuration`);
    }

    return value;
  }
}

function toPhotoResponse(photo: Photo): PhotoResponseDto {
  return {
    id: photo.id,
    galleryId: photo.galleryId,
    filename: photo.filename,
    mimeType: photo.mimeType,
    size: photo.size.toString(),
    width: photo.width,
    height: photo.height,
    status: photo.status,
    sortOrder: photo.sortOrder,
    createdAt: photo.createdAt,
    updatedAt: photo.updatedAt,
  };
}
