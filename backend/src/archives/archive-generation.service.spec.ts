import { ArchiveStatus, PhotoStatus } from '@prisma/client';
import { UnrecoverableError } from 'bullmq';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Readable } from 'node:stream';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { StorageService } from '../storage/storage.service.js';
import { ArchiveGenerationService } from './archive-generation.service.js';

const archive = {
  id: 'archive-id',
  galleryId: 'gallery-id',
  storageKey: null,
  status: ArchiveStatus.PENDING,
  processingLockId: null,
  processingLockExpiresAt: null,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
  expiresAt: null,
};

const photo = {
  id: 'photo-id',
  galleryId: 'gallery-id',
  originalKey: 'galleries/gallery-id/originals/photo-id.jpg',
  previewKey: 'galleries/gallery-id/previews/photo-id.webp',
  thumbnailKey: 'galleries/gallery-id/thumbnails/photo-id.webp',
  filename: 'photo.jpg',
  mimeType: 'image/jpeg',
  size: 123n,
  width: 1200,
  height: 800,
  status: PhotoStatus.READY,
  sortOrder: 0,
  processingLockId: null,
  processingLockExpiresAt: null,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
};

describe('ArchiveGenerationService', () => {
  const prisma = {
    archive: { updateMany: jest.fn(), findUnique: jest.fn() },
    photo: { findMany: jest.fn() },
  } as unknown as PrismaService;
  const storage = {
    exists: jest.fn(),
    download: jest.fn(),
    upload: jest.fn(),
    delete: jest.fn(),
  } as unknown as StorageService;
  const service = new ArchiveGenerationService(prisma, storage, { lockTtlSeconds: 900 });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('streams READY originals into private storage and marks the claimed archive ready', async () => {
    const uploaded: Buffer[] = [];
    jest
      .mocked(prisma.archive.updateMany)
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 1 });
    jest.mocked(prisma.archive.findUnique).mockResolvedValue(archive);
    jest.mocked(prisma.photo.findMany).mockResolvedValue([photo]);
    jest.mocked(storage.exists).mockResolvedValue(true);
    jest
      .mocked(storage.download)
      .mockResolvedValue(Readable.from([Buffer.from('original image bytes')]));
    jest.mocked(storage.upload).mockImplementation(async ({ body }) => {
      for await (const chunk of body) uploaded.push(Buffer.from(chunk));
    });

    await service.process({ archiveId: archive.id });

    expect(storage.download).toHaveBeenCalledWith(photo.originalKey);
    expect(storage.upload).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'archives/archive-id.zip', contentType: 'application/zip' }),
    );
    expect(Buffer.concat(uploaded).subarray(0, 2).toString()).toBe('PK');
    expect(prisma.archive.updateMany).toHaveBeenLastCalledWith({
      where: expect.objectContaining({ id: archive.id, processingLockId: expect.any(String) }),
      data: expect.objectContaining({
        storageKey: 'archives/archive-id.zip',
        status: ArchiveStatus.READY,
      }),
    });
  });

  it('does not process a duplicate delivery while another worker holds the lease', async () => {
    jest.mocked(prisma.archive.updateMany).mockResolvedValue({ count: 0 });

    await service.process({ archiveId: archive.id });

    expect(prisma.archive.findUnique).not.toHaveBeenCalled();
    expect(storage.upload).not.toHaveBeenCalled();
  });

  it('marks the archive failed and cleans up when a READY original is missing', async () => {
    jest
      .mocked(prisma.archive.updateMany)
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 1 });
    jest.mocked(prisma.archive.findUnique).mockResolvedValue(archive);
    jest.mocked(prisma.photo.findMany).mockResolvedValue([photo]);
    jest.mocked(storage.exists).mockResolvedValue(false);
    jest.mocked(storage.delete).mockResolvedValue();

    await expect(service.process({ archiveId: archive.id })).rejects.toBeInstanceOf(
      UnrecoverableError,
    );

    expect(storage.upload).not.toHaveBeenCalled();
    expect(storage.delete).toHaveBeenCalledWith('archives/archive-id.zip');
    expect(prisma.archive.updateMany).toHaveBeenLastCalledWith({
      where: expect.objectContaining({ id: archive.id, processingLockId: expect.any(String) }),
      data: { status: ArchiveStatus.FAILED, processingLockId: null, processingLockExpiresAt: null },
    });
  });
});
