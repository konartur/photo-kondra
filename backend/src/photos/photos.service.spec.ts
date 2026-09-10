import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { PhotoStatus } from '@prisma/client';
import { describe, expect, it, jest } from '@jest/globals';
import type { GalleriesService } from '../galleries/galleries.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { StorageService } from '../storage/storage.service.js';
import { PhotosService } from './photos.service.js';

const photo = {
  id: 'photo-id',
  galleryId: 'gallery-id',
  originalKey: 'galleries/gallery-id/originals/photo-id.jpg',
  previewKey: 'galleries/gallery-id/previews/photo-id.webp',
  thumbnailKey: 'galleries/gallery-id/thumbnails/photo-id.webp',
  filename: 'photo.jpg',
  mimeType: 'image/jpeg',
  size: 123n,
  width: null,
  height: null,
  status: PhotoStatus.READY,
  sortOrder: 0,
  processingLockId: null,
  processingLockExpiresAt: null,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
};

describe('PhotosService', () => {
  const prisma = {
    photo: {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
  } as unknown as PrismaService;
  const galleriesService = { findOne: jest.fn() } as unknown as GalleriesService;
  const storage = {
    createUploadUrl: jest.fn(),
    delete: jest.fn(),
    exists: jest.fn(),
  } as unknown as StorageService;
  const imageProcessingQueue = { add: jest.fn() } as unknown as Queue;
  const configService = {
    getOrThrow: jest.fn((key: string) => (key === 'MAX_PHOTO_SIZE' ? '1000' : '900')),
  } as unknown as ConfigService;
  const service = new PhotosService(
    prisma,
    galleriesService,
    storage,
    imageProcessingQueue,
    configService,
  );

  it('creates an uploading photo and returns a direct storage URL for an allowed image', async () => {
    jest.mocked(storage.createUploadUrl).mockResolvedValue('https://signed.example/upload');
    jest.mocked(prisma.photo.create).mockResolvedValue({ ...photo, status: PhotoStatus.UPLOADING });

    await expect(
      service.requestUpload('admin-id', 'gallery-id', {
        filename: 'IMG_1234.JPG',
        mimeType: 'image/jpeg',
        size: 1000,
      }),
    ).resolves.toEqual({
      photoId: expect.any(String),
      uploadUrl: 'https://signed.example/upload',
      expiresIn: 900,
    });
    expect(storage.createUploadUrl).toHaveBeenCalledWith(
      expect.objectContaining({
        key: expect.stringMatching(/^galleries\/gallery-id\/originals\/.+\.jpg$/),
        contentType: 'image/jpeg',
        expiresIn: 900,
      }),
    );
    expect(prisma.photo.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        galleryId: 'gallery-id',
        filename: 'IMG_1234.JPG',
        mimeType: 'image/jpeg',
        size: 1000n,
        status: PhotoStatus.UPLOADING,
      }),
    });
  });

  it('rejects an upload that exceeds the configured size limit', async () => {
    await expect(
      service.requestUpload('admin-id', 'gallery-id', {
        filename: 'large.jpg',
        mimeType: 'image/jpeg',
        size: 1001,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(storage.createUploadUrl).not.toHaveBeenCalledWith(
      expect.objectContaining({ key: expect.stringContaining('large') }),
    );
  });

  it('confirms an uploaded object before transitioning it to processing', async () => {
    jest
      .mocked(prisma.photo.findFirst)
      .mockResolvedValue({ ...photo, status: PhotoStatus.UPLOADING });
    jest.mocked(storage.exists).mockResolvedValue(true);
    jest
      .mocked(prisma.photo.update)
      .mockResolvedValue({ ...photo, status: PhotoStatus.PROCESSING });

    await expect(service.completeUpload('admin-id', 'photo-id')).resolves.toMatchObject({
      status: PhotoStatus.PROCESSING,
    });
    expect(prisma.photo.update).toHaveBeenCalledWith({
      where: { id: 'photo-id' },
      data: { status: PhotoStatus.PROCESSING },
    });
    expect(imageProcessingQueue.add).toHaveBeenCalledWith('process-photo', { photoId: 'photo-id' });
  });

  it('does not transition a completed upload twice', async () => {
    jest.mocked(prisma.photo.findFirst).mockResolvedValue(photo);

    await expect(service.completeUpload('admin-id', 'photo-id')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('does not mark a photo for processing when its object is absent from storage', async () => {
    jest
      .mocked(prisma.photo.findFirst)
      .mockResolvedValue({ ...photo, status: PhotoStatus.UPLOADING });
    jest.mocked(storage.exists).mockResolvedValue(false);

    await expect(service.completeUpload('admin-id', 'photo-id')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('lists non-deleted photos using cursor pagination', async () => {
    jest
      .mocked(prisma.photo.findMany)
      .mockResolvedValue([photo, { ...photo, id: 'next-photo-id' }]);

    await expect(service.findAll('admin-id', 'gallery-id', { limit: 1 })).resolves.toEqual({
      items: [expect.objectContaining({ id: 'photo-id', size: '123' })],
      nextCursor: 'photo-id',
    });
    expect(galleriesService.findOne).toHaveBeenCalledWith('admin-id', 'gallery-id');
    expect(prisma.photo.findMany).toHaveBeenCalledWith({
      where: { galleryId: 'gallery-id', status: { not: PhotoStatus.DELETED } },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
      take: 2,
    });
  });

  it('updates only the sort order of an owned active photo', async () => {
    jest.mocked(prisma.photo.findFirst).mockResolvedValue(photo);
    jest.mocked(prisma.photo.update).mockResolvedValue({ ...photo, sortOrder: 4 });

    await expect(service.update('admin-id', 'photo-id', { sortOrder: 4 })).resolves.toMatchObject({
      sortOrder: 4,
    });
    expect(prisma.photo.update).toHaveBeenCalledWith({
      where: { id: 'photo-id' },
      data: { sortOrder: 4 },
    });
  });

  it('does not disclose a photo that does not belong to the current administrator', async () => {
    jest.mocked(prisma.photo.findFirst).mockResolvedValue(null);

    await expect(
      service.update('other-admin-id', 'photo-id', { sortOrder: 1 }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('removes all stored derivatives then marks the photo as deleted', async () => {
    jest.mocked(prisma.photo.findFirst).mockResolvedValue(photo);
    jest.mocked(storage.delete).mockResolvedValue();
    jest.mocked(prisma.photo.update).mockResolvedValue({ ...photo, status: PhotoStatus.DELETED });

    await service.remove('admin-id', 'photo-id');

    expect(storage.delete).toHaveBeenCalledTimes(3);
    expect(prisma.photo.update).toHaveBeenCalledWith({
      where: { id: 'photo-id' },
      data: {
        status: PhotoStatus.DELETED,
        processingLockId: null,
        processingLockExpiresAt: null,
      },
    });
  });
});
