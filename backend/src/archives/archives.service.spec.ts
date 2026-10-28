import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { Queue } from 'bullmq';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { GenerateArchiveJobData } from '../queues/queue.constants.js';
import { ArchivesService } from './archives.service.js';

describe('ArchivesService', () => {
  const prisma = {
    archive: { create: jest.fn(), updateMany: jest.fn() },
  } as unknown as PrismaService;
  const queue = { add: jest.fn() } as unknown as Queue<GenerateArchiveJobData>;
  const service = new ArchivesService(prisma, queue);

  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('persists a pending archive before queueing its ID', async () => {
    const archive = { id: 'archive-id', galleryId: 'gallery-id', status: 'PENDING' };
    jest
      .mocked(prisma.archive.create)
      .mockResolvedValue(archive as Awaited<ReturnType<typeof prisma.archive.create>>);
    await expect(service.create('gallery-id')).resolves.toEqual(archive);
    expect(prisma.archive.create).toHaveBeenCalledWith({ data: { galleryId: 'gallery-id' } });
    expect(queue.add).toHaveBeenCalledWith(
      'generate-archive',
      { archiveId: 'archive-id' },
      { jobId: 'archive-id' },
    );
  });

  it('marks an unqueued pending archive failed when Redis is unavailable', async () => {
    jest
      .mocked(prisma.archive.create)
      .mockResolvedValue({ id: 'archive-id' } as Awaited<ReturnType<typeof prisma.archive.create>>);
    jest.mocked(queue.add).mockRejectedValue(new Error('Redis unavailable'));
    await expect(service.create('gallery-id')).rejects.toThrow('Redis unavailable');
    expect(prisma.archive.updateMany).toHaveBeenCalledWith({
      where: { id: 'archive-id', status: 'PENDING' },
      data: { status: 'FAILED' },
    });
  });
});
