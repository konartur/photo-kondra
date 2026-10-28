import { Inject, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Gallery, Photo, PhotoStatus } from '@prisma/client';
import { GalleryAccessService } from '../gallery-access/gallery-access.service.js';
import { ListPhotosQueryDto } from '../photos/dto/list-photos-query.dto.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { STORAGE_SERVICE } from '../storage/storage.service.js';
import type { StorageService } from '../storage/storage.service.js';
import {
  PublicGalleryResponseDto,
  PublicPhotoDownloadResponseDto,
  PublicPhotoListResponseDto,
  PublicPhotoResponseDto,
} from './dto/public-gallery-response.dto.js';

@Injectable()
export class PublicGalleryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly galleryAccessService: GalleryAccessService,
    @Inject(STORAGE_SERVICE) private readonly storage: StorageService,
    private readonly configService: ConfigService,
  ) {}

  async getGallery(token: string): Promise<PublicGalleryResponseDto> {
    const gallery = await this.getAccessibleGallery(token);
    return toPublicGalleryResponse(gallery);
  }

  async getPhotos(
    token: string,
    { limit, cursor }: ListPhotosQueryDto,
  ): Promise<PublicPhotoListResponseDto> {
    const gallery = await this.getAccessibleGallery(token);
    const photos = await this.prisma.photo.findMany({
      where: {
        galleryId: gallery.id,
        status: PhotoStatus.READY,
        thumbnailKey: { not: null },
        previewKey: { not: null },
      },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
      take: limit + 1,
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
    });

    const hasMore = photos.length > limit;
    const visiblePhotos = hasMore ? photos.slice(0, limit) : photos;
    const items = await Promise.all(
      visiblePhotos.map((photo) => this.toPublicPhotoResponse(photo)),
    );

    return {
      items,
      nextCursor: hasMore ? (items.at(-1)?.id ?? null) : null,
    };
  }

  async createPhotoDownloadUrl(
    token: string,
    photoId: string,
  ): Promise<PublicPhotoDownloadResponseDto> {
    const gallery = await this.getAccessibleGallery(token);
    const photo = await this.prisma.photo.findFirst({
      where: {
        id: photoId,
        galleryId: gallery.id,
        status: PhotoStatus.READY,
        originalKey: { not: null },
      },
    });
    if (!photo?.originalKey) throw new NotFoundException('Photo not found');

    const expiresIn = this.getPositiveIntegerConfig('SIGNED_URL_ORIGINAL_TTL');
    const downloadUrl = await this.storage.createDownloadUrl({
      key: photo.originalKey,
      expiresIn,
      filename: photo.filename,
    });

    return { downloadUrl, expiresIn };
  }

  private async getAccessibleGallery(token: string): Promise<Gallery> {
    const accessLink = await this.galleryAccessService.findActiveByToken(token);
    if (!accessLink) throw new NotFoundException('Gallery not found');

    const gallery = await this.prisma.gallery.findUnique({ where: { id: accessLink.galleryId } });
    if (!gallery || gallery.status !== 'READY') throw new NotFoundException('Gallery not found');

    return gallery;
  }

  private async toPublicPhotoResponse(photo: Photo): Promise<PublicPhotoResponseDto> {
    if (!photo.thumbnailKey || !photo.previewKey) {
      throw new Error('READY photo must have thumbnail and preview objects');
    }

    const expiresIn = this.getPreviewTtl();
    const [thumbnailUrl, previewUrl] = await Promise.all([
      this.storage.createDownloadUrl({ key: photo.thumbnailKey, expiresIn }),
      this.storage.createDownloadUrl({ key: photo.previewKey, expiresIn }),
    ]);

    return {
      id: photo.id,
      filename: photo.filename,
      mimeType: photo.mimeType,
      width: photo.width,
      height: photo.height,
      sortOrder: photo.sortOrder,
      thumbnailUrl,
      previewUrl,
    };
  }

  private getPreviewTtl(): number {
    return this.getPositiveIntegerConfig('SIGNED_URL_PREVIEW_TTL');
  }

  private getPositiveIntegerConfig(key: string): number {
    const value = Number(this.configService.getOrThrow<string>(key));
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw new ServiceUnavailableException(`Invalid ${key} configuration`);
    }

    return value;
  }
}

function toPublicGalleryResponse(gallery: Gallery): PublicGalleryResponseDto {
  return {
    id: gallery.id,
    title: gallery.title,
    description: gallery.description,
    createdAt: gallery.createdAt,
  };
}
