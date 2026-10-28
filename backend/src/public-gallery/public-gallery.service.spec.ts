import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PhotoStatus } from '@prisma/client';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { GalleryAccessService } from '../gallery-access/gallery-access.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { StorageService } from '../storage/storage.service.js';
import { PublicGalleryService } from './public-gallery.service.js';

const gallery = {
  id: 'gallery-id',
  title: 'Wedding 2026',
  description: 'Private wedding gallery',
  status: 'READY' as const,
  ownerId: 'admin-id',
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
};

const readyPhoto = {
  id: 'photo-id',
  galleryId: gallery.id,
  originalKey: 'galleries/gallery-id/originals/photo-id.jpg',
  thumbnailKey: 'galleries/gallery-id/thumbnails/photo-id.webp',
  previewKey: 'galleries/gallery-id/previews/photo-id.webp',
  filename: 'photo.jpg',
  mimeType: 'image/jpeg',
  size: 123n,
  width: 4000,
  height: 3000,
  status: PhotoStatus.READY,
  sortOrder: 0,
  processingLockId: null,
  processingLockExpiresAt: null,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
};

describe('PublicGalleryService', () => {
  const prisma = {
    gallery: { findUnique: jest.fn() },
    photo: { findMany: jest.fn(), findFirst: jest.fn() },
  } as unknown as PrismaService;
  const galleryAccessService = { findActiveByToken: jest.fn() } as unknown as GalleryAccessService;
  const storage = { createDownloadUrl: jest.fn() } as unknown as StorageService;
  const configService = {
    getOrThrow: jest.fn((key: string) => (key === 'SIGNED_URL_ORIGINAL_TTL' ? '900' : '3600')),
  } as unknown as ConfigService;
  const service = new PublicGalleryService(prisma, galleryAccessService, storage, configService);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('does not disclose a gallery for an invalid, revoked, or expired token', async () => {
    jest.mocked(galleryAccessService.findActiveByToken).mockResolvedValue(null);

    await expect(service.getGallery('invalid-token')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.gallery.findUnique).not.toHaveBeenCalled();
  });

  it('returns only public gallery metadata after token validation', async () => {
    jest.mocked(galleryAccessService.findActiveByToken).mockResolvedValue({
      galleryId: gallery.id,
    } as Awaited<ReturnType<GalleryAccessService['findActiveByToken']>>);
    jest.mocked(prisma.gallery.findUnique).mockResolvedValue(gallery);

    await expect(service.getGallery('private-token')).resolves.toEqual({
      id: gallery.id,
      title: gallery.title,
      description: gallery.description,
      createdAt: gallery.createdAt,
    });
  });

  it('lists only READY photos with signed thumbnail and preview URLs', async () => {
    jest.mocked(galleryAccessService.findActiveByToken).mockResolvedValue({
      galleryId: gallery.id,
    } as Awaited<ReturnType<GalleryAccessService['findActiveByToken']>>);
    jest.mocked(prisma.gallery.findUnique).mockResolvedValue(gallery);
    jest.mocked(prisma.photo.findMany).mockResolvedValue([readyPhoto]);
    jest
      .mocked(storage.createDownloadUrl)
      .mockResolvedValueOnce('https://signed.example/thumbnail')
      .mockResolvedValueOnce('https://signed.example/preview');

    await expect(service.getPhotos('private-token', { limit: 50 })).resolves.toEqual({
      items: [
        {
          id: readyPhoto.id,
          filename: readyPhoto.filename,
          mimeType: readyPhoto.mimeType,
          width: readyPhoto.width,
          height: readyPhoto.height,
          sortOrder: readyPhoto.sortOrder,
          thumbnailUrl: 'https://signed.example/thumbnail',
          previewUrl: 'https://signed.example/preview',
        },
      ],
      nextCursor: null,
    });
    expect(prisma.photo.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          galleryId: gallery.id,
          status: PhotoStatus.READY,
          thumbnailKey: { not: null },
          previewKey: { not: null },
        }),
      }),
    );
    expect(storage.createDownloadUrl).toHaveBeenCalledWith({
      key: readyPhoto.thumbnailKey,
      expiresIn: 3600,
    });
    expect(storage.createDownloadUrl).toHaveBeenCalledWith({
      key: readyPhoto.previewKey,
      expiresIn: 3600,
    });
  });

  it('creates a short-lived attachment URL only for a READY original in the token gallery', async () => {
    jest.mocked(galleryAccessService.findActiveByToken).mockResolvedValue({
      galleryId: gallery.id,
    } as Awaited<ReturnType<GalleryAccessService['findActiveByToken']>>);
    jest.mocked(prisma.gallery.findUnique).mockResolvedValue(gallery);
    jest.mocked(prisma.photo.findFirst).mockResolvedValue(readyPhoto);
    jest.mocked(storage.createDownloadUrl).mockResolvedValue('https://signed.example/original');

    await expect(service.createPhotoDownloadUrl('private-token', readyPhoto.id)).resolves.toEqual({
      downloadUrl: 'https://signed.example/original',
      expiresIn: 900,
    });
    expect(prisma.photo.findFirst).toHaveBeenCalledWith({
      where: {
        id: readyPhoto.id,
        galleryId: gallery.id,
        status: PhotoStatus.READY,
        originalKey: { not: null },
      },
    });
    expect(storage.createDownloadUrl).toHaveBeenCalledWith({
      key: readyPhoto.originalKey,
      expiresIn: 900,
      filename: readyPhoto.filename,
    });
  });

  it('does not sign a photo outside the accessible gallery', async () => {
    jest.mocked(galleryAccessService.findActiveByToken).mockResolvedValue({
      galleryId: gallery.id,
    } as Awaited<ReturnType<GalleryAccessService['findActiveByToken']>>);
    jest.mocked(prisma.gallery.findUnique).mockResolvedValue(gallery);
    jest.mocked(prisma.photo.findFirst).mockResolvedValue(null);

    await expect(
      service.createPhotoDownloadUrl('private-token', 'other-photo-id'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(storage.createDownloadUrl).not.toHaveBeenCalled();
  });
});
