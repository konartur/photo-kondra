import { Inject, Injectable } from '@nestjs/common';
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
    const archive = await this.prisma.archive.create({ data: { galleryId } });
    try {
      await this.queue.add(
        GENERATE_ARCHIVE_JOB_NAME,
        { archiveId: archive.id },
        { jobId: archive.id },
      );
    } catch (error) {
      await this.prisma.archive.updateMany({
        where: { id: archive.id, status: 'PENDING' },
        data: { status: 'FAILED' },
      });
      throw error;
    }
    return archive;
  }
}
