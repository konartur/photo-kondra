import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { GalleriesService } from '../galleries/galleries.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { GalleryAccessService } from './gallery-access.service.js';

const accessLink = {
  id: 'access-link-id',
  galleryId: 'gallery-id',
  tokenHash: 'hash',
  expiresAt: null,
  isActive: true,
  createdAt: new Date('2026-01-01'),
};

describe('GalleryAccessService', () => {
  const galleryAccess = {
    create:
      jest.fn<
        (args: {
          data: { galleryId: string; tokenHash: string; expiresAt: Date | null };
        }) => Promise<typeof accessLink>
      >(),
    findMany: jest.fn<(args: unknown) => Promise<(typeof accessLink)[]>>(),
    findFirst: jest.fn<(args: unknown) => Promise<typeof accessLink | null>>(),
    update: jest.fn<(args: unknown) => Promise<typeof accessLink>>(),
  };
  const prisma = { galleryAccess } as unknown as PrismaService;
  const galleriesService = {
    findOne: jest.fn(),
    archiveStatus: jest.fn(),
  } as unknown as GalleriesService;
  const configService = {
    getOrThrow: jest.fn(() => 'https://photos.example.com/'),
  } as unknown as ConfigService;
  const service = new GalleryAccessService(prisma, galleriesService, configService);
  beforeEach(() => {
    jest
      .mocked(galleriesService.archiveStatus)
      .mockResolvedValue({
        id: 'archive',
        status: 'READY',
        canPublish: true,
        pendingPhotoCount: 0,
      });
    jest
      .mocked(galleriesService.findOne)
      .mockResolvedValue({ status: 'READY' } as Awaited<
        ReturnType<typeof galleriesService.findOne>
      >);
  });

  it('returns a private URL once and persists only its SHA-256 hash', async () => {
    galleryAccess.create.mockImplementation(async ({ data }: { data: { tokenHash: string } }) => ({
      ...accessLink,
      tokenHash: data.tokenHash,
    }));

    const result = await service.create('admin-id', 'gallery-id', {});
    const token = result.url.split('/').at(-1);

    expect(result).not.toHaveProperty('tokenHash');
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/u);
    expect(token).toBeDefined();
    expect(galleryAccess.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        galleryId: 'gallery-id',
        tokenHash: createHash('sha256')
          .update(token as string)
          .digest('hex'),
      }),
    });
  });

  it('lists access link metadata without token hashes', async () => {
    galleryAccess.findMany.mockResolvedValue([accessLink]);

    await expect(service.findAll('admin-id', 'gallery-id')).resolves.toEqual([
      expect.not.objectContaining({ tokenHash: expect.anything() }),
    ]);
    expect(galleryAccess.findMany).toHaveBeenCalledWith({
      where: { galleryId: 'gallery-id' },
      orderBy: { createdAt: 'desc' },
    });
  });

  it('rejects an expiration date that is not in the future', async () => {
    await expect(
      service.create('admin-id', 'gallery-id', { expiresAt: '2020-01-01T00:00:00.000Z' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('revokes only an access link owned through the current administrator gallery', async () => {
    galleryAccess.findFirst.mockResolvedValue(accessLink);
    galleryAccess.update.mockResolvedValue({ ...accessLink, isActive: false });

    await service.revoke('admin-id', 'access-link-id');

    expect(galleryAccess.findFirst).toHaveBeenCalledWith({
      where: { id: 'access-link-id', gallery: { ownerId: 'admin-id' } },
    });
    expect(galleryAccess.update).toHaveBeenCalledWith({
      where: { id: 'access-link-id' },
      data: { isActive: false },
    });
  });

  it('does not disclose a link outside the current administrator ownership', async () => {
    galleryAccess.findFirst.mockResolvedValue(null);

    await expect(service.revoke('other-admin-id', 'access-link-id')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
