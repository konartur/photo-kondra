import { ConflictException, NotFoundException } from '@nestjs/common';
import { GalleryStatus } from '@prisma/client';
import { describe, expect, it, jest } from '@jest/globals';
import { PrismaService } from '../prisma/prisma.service.js';
import { GalleriesService } from './galleries.service.js';

const gallery = {
  id: 'gallery-id',
  title: 'Wedding 2026',
  description: null,
  status: GalleryStatus.DRAFT,
  ownerId: 'admin-id',
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
};

describe('GalleriesService', () => {
  const prisma = {
    gallery: {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  } as unknown as PrismaService;
  const service = new GalleriesService(prisma);

  it('creates a draft gallery for the current administrator', async () => {
    jest.mocked(prisma.gallery.create).mockResolvedValue(gallery);

    await expect(service.create('admin-id', { title: 'Wedding 2026' })).resolves.toEqual(gallery);
    expect(prisma.gallery.create).toHaveBeenCalledWith({
      data: { ownerId: 'admin-id', title: 'Wedding 2026', description: null },
    });
  });

  it('lists only the current administrator’s galleries, newest first', async () => {
    jest.mocked(prisma.gallery.findMany).mockResolvedValue([gallery]);

    await expect(service.findAll('admin-id')).resolves.toEqual([gallery]);
    expect(prisma.gallery.findMany).toHaveBeenCalledWith({
      where: { ownerId: 'admin-id' },
      orderBy: { createdAt: 'desc' },
    });
  });

  it('does not disclose a gallery that does not belong to the current administrator', async () => {
    jest.mocked(prisma.gallery.findFirst).mockResolvedValue(null);

    await expect(service.findOne('other-admin-id', 'gallery-id')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.gallery.findFirst).toHaveBeenCalledWith({
      where: { id: 'gallery-id', ownerId: 'other-admin-id' },
    });
  });

  it('updates an owned gallery after checking ownership', async () => {
    jest.mocked(prisma.gallery.findFirst).mockResolvedValue(gallery);
    jest.mocked(prisma.gallery.update).mockResolvedValue({ ...gallery, title: 'Updated wedding' });

    await expect(
      service.update('admin-id', 'gallery-id', { title: 'Updated wedding' }),
    ).resolves.toMatchObject({
      title: 'Updated wedding',
    });
    expect(prisma.gallery.update).toHaveBeenCalledWith({
      where: { id: 'gallery-id' },
      data: { title: 'Updated wedding' },
    });
  });

  it('deletes an owned gallery after checking ownership', async () => {
    jest.mocked(prisma.gallery.findFirst).mockResolvedValue(gallery);
    jest.mocked(prisma.gallery.delete).mockResolvedValue(gallery);

    await service.remove('admin-id', 'gallery-id');
    expect(prisma.gallery.delete).toHaveBeenCalledWith({ where: { id: 'gallery-id' } });
  });

  it('transitions an owned gallery when the lifecycle allows it', async () => {
    jest.mocked(prisma.gallery.findFirst).mockResolvedValue(gallery);
    jest.mocked(prisma.gallery.update).mockResolvedValue({
      ...gallery,
      status: GalleryStatus.PROCESSING,
    });

    await expect(
      service.transitionStatus('admin-id', 'gallery-id', GalleryStatus.PROCESSING),
    ).resolves.toMatchObject({ status: GalleryStatus.PROCESSING });
    expect(prisma.gallery.update).toHaveBeenCalledWith({
      where: { id: 'gallery-id' },
      data: { status: GalleryStatus.PROCESSING },
    });
  });

  it('rejects a lifecycle transition that skips processing', async () => {
    jest.mocked(prisma.gallery.findFirst).mockResolvedValue(gallery);

    await expect(
      service.transitionStatus('admin-id', 'gallery-id', GalleryStatus.READY),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.gallery.update).not.toHaveBeenCalledWith({
      where: { id: 'gallery-id' },
      data: { status: GalleryStatus.READY },
    });
  });

  it('does not transition a terminal archived gallery', async () => {
    jest.mocked(prisma.gallery.findFirst).mockResolvedValue({
      ...gallery,
      status: GalleryStatus.ARCHIVED,
    });

    await expect(
      service.transitionStatus('admin-id', 'gallery-id', GalleryStatus.DRAFT),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
