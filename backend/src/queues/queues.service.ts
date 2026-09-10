import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';
import { ARCHIVE_GENERATION_QUEUE, IMAGE_PROCESSING_QUEUE } from './queue.constants.js';

@Injectable()
export class QueuesService implements OnModuleDestroy {
  constructor(
    @Inject(IMAGE_PROCESSING_QUEUE) readonly imageProcessingQueue: Queue,
    @Inject(ARCHIVE_GENERATION_QUEUE) readonly archiveGenerationQueue: Queue,
  ) {}

  async onModuleDestroy(): Promise<void> {
    await Promise.all([this.imageProcessingQueue.close(), this.archiveGenerationQueue.close()]);
  }
}
