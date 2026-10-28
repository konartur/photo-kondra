import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { Queue } from 'bullmq';
import type { PrismaService } from '../prisma/prisma.service.js';
import { Prisma } from '@prisma/client';
import type { GenerateArchiveJobData } from '../queues/queue.constants.js';
import { ArchivesService } from './archives.service.js';

describe('ArchivesService', () => {
  const prisma = {
    archive: { create: jest.fn(), updateMany: jest.fn(), findFirst: jest.fn() },
    photo: { findMany: jest.fn() },
    $transaction: jest.fn(),
  } as unknown as PrismaService;
  const queue = { add: jest.fn() } as unknown as Queue<GenerateArchiveJobData>;
  const service = new ArchivesService(prisma, queue);

  beforeEach(() => {
    jest.resetAllMocks();
    const transaction = async (callback: unknown) => {
      if (typeof callback !== 'function') throw new Error('Expected interactive transaction');
      return (callback as (tx: Prisma.TransactionClient) => Promise<unknown>)(prisma);
    };
    jest.mocked(prisma.$transaction).mockImplementation(transaction as typeof prisma.$transaction);
    jest
      .mocked(prisma.photo.findMany)
      .mockResolvedValue([
        { id: 'photo', originalKey: 'original', filename: 'a.jpg', size: 1n, sortOrder: 0 },
      ] as Awaited<ReturnType<typeof prisma.photo.findMany>>);
    jest.mocked(prisma.archive.findFirst).mockResolvedValue(null);
  });

  it('persists a pending archive before queueing its ID', async () => {
    const archive = { id: 'archive-id', galleryId: 'gallery-id', status: 'PENDING' };
    jest
      .mocked(prisma.archive.create)
      .mockResolvedValue(archive as Awaited<ReturnType<typeof prisma.archive.create>>);
    await expect(service.create('gallery-id')).resolves.toEqual(archive);
    expect(prisma.archive.create).toHaveBeenCalledWith({
      data: { galleryId: 'gallery-id', contentHash: expect.any(String) },
    });
    expect(queue.add).toHaveBeenCalledWith(
      'generate-archive',
      { archiveId: 'archive-id' },
      { jobId: 'archive-id' },
    );
  });

  it('marks an unqueued pending archive failed when Redis is unavailable', async () => {
    jest
      .mocked(prisma.archive.create)
      .mockResolvedValue({ id: 'archive-id', status: 'PENDING' } as Awaited<
        ReturnType<typeof prisma.archive.create>
      >);
    jest.mocked(queue.add).mockRejectedValue(new Error('Redis unavailable'));
    await expect(service.create('gallery-id')).rejects.toThrow(
      'Archive queue is temporarily unavailable',
    );
    expect(prisma.archive.updateMany).toHaveBeenCalledWith({
      where: { id: 'archive-id', status: 'PENDING' },
      data: { status: 'FAILED' },
    });
  });

  it.each(['PENDING', 'PROCESSING', 'READY'] as const)(
    'reuses an existing %s archive for the same content',
    async (status) => {
      const existing = { id: 'existing', status } as Awaited<
        ReturnType<typeof prisma.archive.create>
      >;
      jest.mocked(prisma.archive.findFirst).mockResolvedValue(existing);
      await expect(service.create('gallery-id')).resolves.toEqual(existing);
      expect(prisma.archive.create).not.toHaveBeenCalled();
      expect(queue.add).toHaveBeenCalledTimes(status === 'PENDING' ? 1 : 0);
      expect(prisma.archive.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            galleryId: 'gallery-id',
            contentHash: expect.any(String),
            OR: expect.arrayContaining([
              expect.objectContaining({
                status: 'READY',
                OR: expect.arrayContaining([
                  { expiresAt: null },
                  { expiresAt: { gt: expect.any(Date) } },
                ]),
              }),
            ]),
          }),
        }),
      );
    },
  );

  it('retries a serialization conflict before enqueueing', async () => {
    jest.mocked(prisma.$transaction).mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('Conflict', {
        code: 'P2034',
        clientVersion: 'test',
      }),
    );
    jest
      .mocked(prisma.archive.create)
      .mockResolvedValue({ id: 'new', status: 'PENDING' } as Awaited<
        ReturnType<typeof prisma.archive.create>
      >);
    await service.create('gallery-id');
    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
    expect(queue.add).toHaveBeenCalledTimes(1);
  });

  it('rejects empty galleries without enqueueing', async () => {
    jest.mocked(prisma.photo.findMany).mockResolvedValue([]);
    await expect(service.create('gallery-id')).rejects.toThrow('Gallery has no ready photos');
    expect(queue.add).not.toHaveBeenCalled();
  });
});
