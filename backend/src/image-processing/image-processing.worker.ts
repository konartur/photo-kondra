import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { Worker } from 'bullmq';
import { IMAGE_PROCESSING_QUEUE_NAME } from '../queues/queue.constants.js';
import type { ProcessPhotoJobData } from '../queues/queue.constants.js';
import { QUEUE_CONFIG } from '../queues/queue.config.js';
import type { QueueInfrastructureConfig } from '../queues/queue.config.js';
import { ImageProcessingService } from './image-processing.service.js';
import { JobLogger, logTransportError } from '../common/logging/job-logging.js';

@Injectable()
export class ImageProcessingWorker implements OnModuleDestroy {
  private readonly worker: Worker<ProcessPhotoJobData>;
  private readonly jobLogger = new JobLogger(IMAGE_PROCESSING_QUEUE_NAME);

  constructor(
    imageProcessingService: ImageProcessingService,
    @Inject(QUEUE_CONFIG) queueConfig: QueueInfrastructureConfig,
  ) {
    this.worker = new Worker<ProcessPhotoJobData>(
      IMAGE_PROCESSING_QUEUE_NAME,
      async (job) => this.jobLogger.run(job, () => imageProcessingService.process(job.data)),
      { connection: queueConfig.connection },
    );
    this.worker.on('failed', (job, error) => this.jobLogger.failed(job, error));
    this.worker.on('error', (error) =>
      logTransportError('worker_error', IMAGE_PROCESSING_QUEUE_NAME, error),
    );
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker.close();
  }
}
