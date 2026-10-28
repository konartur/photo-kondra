import { ConfigService } from '@nestjs/config';
import type { Archive } from '@prisma/client';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { ArchivesService } from '../archives/archives.service.js';
import type { GalleryAccessService } from '../gallery-access/gallery-access.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { StorageService } from '../storage/storage.service.js';
import { PublicArchivesService } from './public-archives.service.js';

const row = {
  id: 'archive',
  galleryId: 'gallery',
  status: 'PROCESSING',
  expiresAt: null,
  storageKey: null,
} as Archive;
describe('public archive access', () => {
  const prisma = {
    gallery: { findUnique: jest.fn() },
    archive: { findFirst: jest.fn() },
  } as unknown as PrismaService;
  const access = { findActiveByToken: jest.fn() } as unknown as GalleryAccessService;
  const archives = { create: jest.fn(), current: jest.fn() } as unknown as ArchivesService;
  const storage = { createDownloadUrl: jest.fn() } as unknown as StorageService;
  const service = new PublicArchivesService(
    prisma,
    access,
    archives,
    storage,
    new ConfigService({ SIGNED_URL_ARCHIVE_TTL: '3600' }),
  );
  beforeEach(() => {
    jest.resetAllMocks();
    jest
      .mocked(access.findActiveByToken)
      .mockResolvedValue({ galleryId: 'gallery' } as NonNullable<
        Awaited<ReturnType<typeof access.findActiveByToken>>
      >);
    jest
      .mocked(prisma.gallery.findUnique)
      .mockResolvedValue({ id: 'gallery', status: 'READY' } as NonNullable<
        Awaited<ReturnType<typeof prisma.gallery.findUnique>>
      >);
    jest.mocked(prisma.archive.findFirst).mockResolvedValue(row);
    jest.mocked(archives.create).mockResolvedValue(row);
    jest.mocked(archives.current).mockResolvedValue({ ...row, status: 'READY', storageKey: 'key' });
    jest.mocked(storage.createDownloadUrl).mockResolvedValue('https://signed.example/zip');
  });
  it.each(['invalid', 'expired', 'revoked'])(
    'rejects %s tokens for creation and status',
    async (token) => {
      jest.mocked(access.findActiveByToken).mockResolvedValue(null);
      await expect(service.request(token)).rejects.toThrow('Gallery not found');
      await expect(service.status(token, 'archive')).rejects.toThrow('Gallery not found');
      expect(archives.create).not.toHaveBeenCalled();
      expect(storage.createDownloadUrl).not.toHaveBeenCalled();
    },
  );
  it('does not expose archives across gallery boundaries', async () => {
    jest.mocked(prisma.archive.findFirst).mockResolvedValue(null);
    await expect(service.status('token', 'other')).rejects.toThrow('Archive not found');
    expect(prisma.archive.findFirst).toHaveBeenCalledWith({
      where: { id: 'other', galleryId: 'gallery' },
    });
    expect(storage.createDownloadUrl).not.toHaveBeenCalled();
  });
  it.each(['PENDING', 'PROCESSING', 'FAILED'] as const)(
    'returns %s without storage keys or a download URL',
    async (status) => {
      jest
        .mocked(prisma.archive.findFirst)
        .mockResolvedValue({ ...row, status, storageKey: 'private-key' });
      expect(await service.status('token', 'archive')).toEqual({
        id: 'archive',
        status,
        expiresAt: null,
      });
      expect(storage.createDownloadUrl).not.toHaveBeenCalled();
    },
  );
  it('signs READY archives for no longer than their remaining retention', async () => {
    const expiresAt = new Date(Date.now() + 600000);
    jest
      .mocked(prisma.archive.findFirst)
      .mockResolvedValue({ ...row, status: 'READY', storageKey: 'private-key', expiresAt });
    const result = await service.status('token', 'archive');
    expect(result.downloadUrl).toBe('https://signed.example/zip');
    expect(result.expiresIn!).toBeGreaterThan(590);
    expect(result.expiresIn!).toBeLessThanOrEqual(600);
    expect(result).not.toHaveProperty('storageKey');
    expect(storage.createDownloadUrl).toHaveBeenCalledWith({
      key: 'private-key',
      expiresIn: result.expiresIn!,
      filename: 'gallery-gallery.zip',
    });
  });
  it('rejects expired READY archives without signing', async () => {
    jest.mocked(prisma.archive.findFirst).mockResolvedValue({
      ...row,
      status: 'READY',
      storageKey: 'private-key',
      expiresAt: new Date(0),
    });
    await expect(service.status('token', 'archive')).rejects.toThrow('Archive expired');
    expect(storage.createDownloadUrl).not.toHaveBeenCalled();
  });
  it('authorizes each operation again after revocation', async () => {
    await service.request('token');
    expect(archives.current).toHaveBeenCalledWith('gallery');
    expect(archives.create).not.toHaveBeenCalled();
    jest.mocked(access.findActiveByToken).mockResolvedValue(null);
    await expect(service.status('token', 'archive')).rejects.toThrow('Gallery not found');
  });
});
