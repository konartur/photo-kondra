import {
  BadRequestException,
  Inject,
  Injectable,
  ServiceUnavailableException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { Archive, Prisma } from '@prisma/client';
import { archiveContentHash } from './archive-content.js';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service.js';
import { ARCHIVE_GENERATION_QUEUE, GENERATE_ARCHIVE_JOB_NAME } from '../queues/queue.constants.js';
import type { GenerateArchiveJobData } from '../queues/queue.constants.js';

@Injectable()
export class ArchivesService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(ARCHIVE_GENERATION_QUEUE) private readonly queue: Queue<GenerateArchiveJobData>,
  ) {}

  // The caller must authorize gallery access before requesting an archive.
  async create(galleryId: string) {
    const archive = await this.findOrCreate(galleryId);
    return this.enqueue(archive);
  }

  async publish(ownerId: string, galleryId: string) {
    return this.enqueue(await this.findOrCreate(galleryId, ownerId));
  }

  async current(galleryId: string): Promise<Archive | null> {
    const photos = await this.prisma.photo.findMany({
      where: { galleryId, status: 'READY', originalKey: { not: null } },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
    });
    if (!photos.length) return null;
    const contentHash = archiveContentHash(photos);
    const ready = await this.prisma.archive.findFirst({
      where: {
        galleryId,
        contentHash,
        status: 'READY',
        storageKey: { not: null },
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      orderBy: { createdAt: 'desc' },
    });
    if (ready) return ready;
    return this.prisma.archive.findFirst({
      where: {
        galleryId,
        contentHash,
        OR: [
          { status: { in: ['PENDING', 'PROCESSING', 'FAILED'] } },
          {
            status: 'READY',
            storageKey: { not: null },
            OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
          },
        ],
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  private async enqueue(archive: Archive) {
    if (archive.status !== 'PENDING') return archive;
    try {
      await this.queue.add(
        GENERATE_ARCHIVE_JOB_NAME,
        { archiveId: archive.id },
        { jobId: archive.id },
      );
    } catch {
      await this.prisma.archive.updateMany({
        where: { id: archive.id, status: 'PENDING' },
        data: { status: 'FAILED' },
      });
      throw new ServiceUnavailableException('Archive queue is temporarily unavailable');
    }
    return archive;
  }

  private async findOrCreate(galleryId: string, ownerId?: string): Promise<Archive> {
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        return await this.prisma.$transaction(
          async (tx) => {
            let previousStatus: string | undefined;
            if (ownerId) {
              const gallery = await tx.gallery.findFirst({ where: { id: galleryId, ownerId } });
              if (!gallery) throw new NotFoundException('Gallery not found');
              if (gallery.status === 'ARCHIVED')
                throw new ConflictException('Archived galleries cannot be published');
              previousStatus = gallery.status;
              // This row is also locked by photo mutations, so publication sees a stable set.
              if (gallery.status === 'DRAFT')
                await tx.gallery.update({
                  where: { id: galleryId },
                  data: { updatedAt: new Date() },
                });
              const unfinished = await tx.photo.count({
                where: {
                  galleryId,
                  OR: [
                    { status: { notIn: ['READY', 'DELETED'] } },
                    { status: 'READY', originalKey: null },
                  ],
                },
              });
              if (unfinished)
                throw new ConflictException(
                  'Wait until all photos are ready, or remove failed/incomplete uploads',
                );
            }
            const photos = await tx.photo.findMany({
              where: { galleryId, status: 'READY', originalKey: { not: null } },
              orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
              select: { id: true, originalKey: true, filename: true, size: true, sortOrder: true },
            });
            if (!photos.length) throw new BadRequestException('Gallery has no ready photos');
            const contentHash = archiveContentHash(photos);
            const existing = await tx.archive.findFirst({
              where: {
                galleryId,
                contentHash,
                OR: [
                  { status: { in: ['PENDING', 'PROCESSING'] } },
                  {
                    status: 'READY',
                    OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
                    storageKey: { not: null },
                  },
                ],
              },
              orderBy: { createdAt: 'desc' },
            });
            let archive =
              existing ?? (await tx.archive.create({ data: { galleryId, contentHash } }));
            if (ownerId && archive.status === 'READY' && archive.expiresAt)
              archive = await tx.archive.update({
                where: { id: archive.id },
                data: { expiresAt: null },
              });
            const nextStatus = archive.status === 'READY' ? 'READY' : 'PROCESSING';
            if (ownerId && previousStatus !== nextStatus)
              await tx.gallery.update({ where: { id: galleryId }, data: { status: nextStatus } });
            return archive;
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
      } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2034')
          throw error;
      }
    }
    throw new ServiceUnavailableException('Archive is busy; please retry');
  }
}
