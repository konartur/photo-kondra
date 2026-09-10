import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { Worker } from 'bullmq';
import { IMAGE_PROCESSING_QUEUE_NAME } from '../queues/queue.constants.js';
import type { ProcessPhotoJobData } from '../queues/queue.constants.js';
import { QUEUE_CONFIG } from '../queues/queue.config.js';
import type { QueueInfrastructureConfig } from '../queues/queue.config.js';
import { ImageProcessingService } from './image-processing.service.js';

@Injectable()
export class ImageProcessingWorker implements OnModuleDestroy {
  private readonly worker: Worker<ProcessPhotoJobData>;

  constructor(
    imageProcessingService: ImageProcessingService,
    @Inject(QUEUE_CONFIG) queueConfig: QueueInfrastructureConfig,
  ) {
    this.worker = new Worker<ProcessPhotoJobData>(
      IMAGE_PROCESSING_QUEUE_NAME,
      async (job) => imageProcessingService.process(job.data),
      { connection: queueConfig.connection },
    );
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker.close();
  }
}
