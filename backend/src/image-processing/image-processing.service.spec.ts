import { Readable } from 'node:stream';
import { PhotoStatus } from '@prisma/client';
import { UnrecoverableError } from 'bullmq';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import sharp from 'sharp';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { StorageService } from '../storage/storage.service.js';
import { ImageProcessingService } from './image-processing.service.js';

const photo = {
  id: 'photo-id',
  galleryId: 'gallery-id',
  originalKey: 'galleries/gallery-id/originals/photo-id.jpg',
  previewKey: null,
  thumbnailKey: null,
  filename: 'photo.jpg',
  mimeType: 'image/jpeg',
  size: 123n,
  width: null,
  height: null,
  status: PhotoStatus.PROCESSING,
  sortOrder: 0,
  processingLockId: 'processing-lock',
  processingLockExpiresAt: new Date('2026-01-01'),
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
};

describe('ImageProcessingService', () => {
  const prisma = {
    photo: { findUnique: jest.fn(), updateMany: jest.fn() },
  } as unknown as PrismaService;
  const storage = {
    exists: jest.fn(),
    download: jest.fn(),
    upload: jest.fn(),
    delete: jest.fn(),
  } as unknown as StorageService;
  const service = new ImageProcessingService(prisma, storage, {
    thumbnailWidth: 300,
    previewWidth: 1600,
    lockTtlSeconds: 900,
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates WebP derivatives and atomically marks a claimed processing photo ready', async () => {
    jest.mocked(prisma.photo.updateMany).mockResolvedValue({ count: 1 });
    jest.mocked(prisma.photo.findUnique).mockResolvedValue(photo);
    const onePixelPng = await sharp({
      create: { width: 1, height: 1, channels: 3, background: { r: 255, g: 0, b: 0 } },
    })
      .png()
      .toBuffer();
    jest.mocked(storage.exists).mockResolvedValue(true);
    jest.mocked(storage.download).mockResolvedValue(Readable.from([onePixelPng]));
    jest.mocked(storage.upload).mockResolvedValue();

    await service.process({ photoId: 'photo-id' });

    expect(storage.download).toHaveBeenCalledWith(photo.originalKey);
    expect(storage.upload).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'galleries/gallery-id/thumbnails/photo-id.webp' }),
    );
    expect(storage.upload).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'galleries/gallery-id/previews/photo-id.webp' }),
    );
    expect(prisma.photo.updateMany).toHaveBeenLastCalledWith({
      where: expect.objectContaining({ id: 'photo-id', processingLockId: expect.any(String) }),
      data: expect.objectContaining({ status: PhotoStatus.READY, width: 1, height: 1 }),
    });
  });

  it('does not process a duplicate delivery while another worker owns the active lease', async () => {
    jest.mocked(prisma.photo.updateMany).mockResolvedValue({ count: 0 });

    await service.process({ photoId: 'photo-id' });

    expect(prisma.photo.findUnique).not.toHaveBeenCalled();
    expect(storage.download).not.toHaveBeenCalled();
  });

  it('releases a lease without processing an already complete photo', async () => {
    jest.mocked(prisma.photo.updateMany).mockResolvedValue({ count: 1 });
    jest.mocked(prisma.photo.findUnique).mockResolvedValue({
      ...photo,
      status: PhotoStatus.READY,
      width: 4000,
      height: 3000,
      thumbnailKey: 'thumbnail.webp',
      previewKey: 'preview.webp',
    });

    await service.process({ photoId: 'photo-id' });

    expect(storage.download).not.toHaveBeenCalled();
    expect(prisma.photo.updateMany).toHaveBeenLastCalledWith({
      where: expect.objectContaining({ id: 'photo-id', processingLockId: expect.any(String) }),
      data: { processingLockId: null, processingLockExpiresAt: null },
    });
  });

  it('cleans up partial derivatives and keeps a transient storage failure retryable', async () => {
    jest.mocked(prisma.photo.updateMany).mockResolvedValue({ count: 1 });
    jest.mocked(prisma.photo.findUnique).mockResolvedValue(photo);
    const onePixelPng = await sharp({
      create: { width: 1, height: 1, channels: 3, background: 'red' },
    })
      .png()
      .toBuffer();
    jest.mocked(storage.exists).mockResolvedValue(true);
    jest.mocked(storage.download).mockResolvedValue(Readable.from([onePixelPng]));
    jest
      .mocked(storage.upload)
      .mockResolvedValueOnce()
      .mockRejectedValueOnce(new Error('S3 timeout'));
    jest.mocked(storage.delete).mockResolvedValue();

    await expect(service.process({ photoId: 'photo-id' })).rejects.toThrow('S3 timeout');
    expect(storage.delete).toHaveBeenCalledTimes(2);
    expect(prisma.photo.updateMany).toHaveBeenLastCalledWith({
      where: expect.objectContaining({ id: 'photo-id', processingLockId: expect.any(String) }),
      data: expect.objectContaining({
        status: PhotoStatus.FAILED,
        thumbnailKey: null,
        previewKey: null,
      }),
    });
  });

  it('marks a missing original as terminal and prevents futile queue retries', async () => {
    jest.mocked(prisma.photo.updateMany).mockResolvedValue({ count: 1 });
    jest.mocked(prisma.photo.findUnique).mockResolvedValue(photo);
    jest.mocked(storage.exists).mockResolvedValue(false);
    jest.mocked(storage.delete).mockResolvedValue();

    await expect(service.process({ photoId: 'photo-id' })).rejects.toBeInstanceOf(
      UnrecoverableError,
    );
    expect(storage.download).not.toHaveBeenCalled();
    expect(prisma.photo.updateMany).toHaveBeenLastCalledWith({
      where: expect.objectContaining({ id: 'photo-id', processingLockId: expect.any(String) }),
      data: expect.objectContaining({ status: PhotoStatus.FAILED }),
    });
  });

  it('classifies a malformed original as terminal and clears incomplete state', async () => {
    jest.mocked(prisma.photo.updateMany).mockResolvedValue({ count: 1 });
    jest.mocked(prisma.photo.findUnique).mockResolvedValue(photo);
    jest.mocked(storage.exists).mockResolvedValue(true);
    jest.mocked(storage.download).mockResolvedValue(Readable.from([Buffer.from('not an image')]));
    jest.mocked(storage.delete).mockResolvedValue();

    await expect(service.process({ photoId: 'photo-id' })).rejects.toBeInstanceOf(
      UnrecoverableError,
    );
    expect(storage.delete).toHaveBeenCalledTimes(2);
  });
});
