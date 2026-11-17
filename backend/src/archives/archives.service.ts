import {
  BadRequestException,
  Inject,
  Injectable,
  ServiceUnavailableException,
  NotFoundException,
  ConflictException,
  HttpException,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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
    @Optional() private readonly config: ConfigService = new ConfigService(),
  ) {}

  // The caller must authorize gallery access before requesting an archive.
  async create(galleryId: string) {
    const archive = await this.findOrCreate(galleryId);
    return this.enqueue(archive);
  }

  async publish(ownerId: string, galleryId: string) {
    return this.enqueue(await this.findOrCreate(galleryId, ownerId));
  }

  async createSelected(galleryId: string, photoIds: string[]) {
    if (!photoIds.length || photoIds.length > 500 || new Set(photoIds).size !== photoIds.length)
      throw new BadRequestException('Select between 1 and 500 unique photos');
    return this.enqueue(await this.findOrCreate(galleryId, undefined, photoIds));
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
        selectedPhotoIds: { isEmpty: true },
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
        selectedPhotoIds: { isEmpty: true },
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

  private async findOrCreate(
    galleryId: string,
    ownerId?: string,
    photoIds?: string[],
  ): Promise<Archive> {
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        return await this.prisma.$transaction(
          async (tx) => {
            if (photoIds) {
              const gallery = await tx.gallery.findUnique({ where: { id: galleryId } });
              if (gallery?.status !== 'READY') throw new NotFoundException('Gallery not found');
            }
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
              where: {
                galleryId,
                status: 'READY',
                originalKey: { not: null },
                ...(photoIds ? { id: { in: photoIds } } : {}),
              },
              orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
              select: { id: true, originalKey: true, filename: true, size: true, sortOrder: true },
            });
            if (!photos.length) throw new BadRequestException('Gallery has no ready photos');
            if (photoIds && photos.length !== photoIds.length)
              throw new BadRequestException(
                'Every selected photo must be ready and belong to this gallery',
              );
            if (
              photoIds &&
              photos.reduce((sum, photo) => sum + photo.size, 0n) >
                BigInt(this.positiveSetting('MAX_ARCHIVE_SIZE', 2147483648))
            )
              throw new BadRequestException('Selected photos exceed the archive size limit');
            const contentHash = archiveContentHash(photos);
            const existing = await tx.archive.findFirst({
              where: {
                galleryId,
                selectedPhotoIds: { isEmpty: !photoIds },
                contentHash,
                OR: [
                  {
                    status: { in: ['PENDING', 'PROCESSING'] },
                    ...(photoIds ? { expiresAt: { gt: new Date() } } : {}),
                  },
                  {
                    status: 'READY',
                    OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
                    storageKey: { not: null },
                  },
                ],
              },
              orderBy: { createdAt: 'desc' },
            });
            if (photoIds && !existing) {
              const recent = await tx.archive.count({
                where: {
                  galleryId,
                  selectedPhotoIds: { isEmpty: false },
                  createdAt: { gt: new Date(Date.now() - 60000) },
                },
              });
              if (recent >= this.positiveSetting('SELECTED_ARCHIVE_REQUESTS_PER_MINUTE', 3))
                throw new HttpException('Too many archive requests; try again in a minute', 429);
              const active = await tx.archive.count({
                where: {
                  galleryId,
                  selectedPhotoIds: { isEmpty: false },
                  status: { in: ['PENDING', 'PROCESSING'] },
                  expiresAt: { gt: new Date() },
                },
              });
              if (active >= this.positiveSetting('SELECTED_ARCHIVE_MAX_ACTIVE', 3))
                throw new HttpException('Archive preparation is busy; please try again later', 429);
            }
            let archive =
              existing ??
              (await tx.archive.create({
                data: {
                  galleryId,
                  contentHash,
                  ...(photoIds
                    ? {
                        selectedPhotoIds: photos.map((photo) => photo.id),
                        expiresAt: new Date(
                          Date.now() +
                            this.positiveSetting('SELECTED_ARCHIVE_RETENTION_TTL', 86400) * 1000,
                        ),
                      }
                    : {}),
                },
              }));
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

  private positiveSetting(key: string, fallback: number): number {
    const value = Number(this.config.get<string>(key) ?? fallback);
    if (!Number.isSafeInteger(value) || value <= 0)
      throw new ServiceUnavailableException('Archive configuration is invalid');
    return value;
  }
}
