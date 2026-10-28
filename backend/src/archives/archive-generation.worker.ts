import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { Worker } from 'bullmq';
import { ARCHIVE_GENERATION_QUEUE_NAME } from '../queues/queue.constants.js';
import type { GenerateArchiveJobData } from '../queues/queue.constants.js';
import { QUEUE_CONFIG } from '../queues/queue.config.js';
import type { QueueInfrastructureConfig } from '../queues/queue.config.js';
import { ArchiveGenerationService } from './archive-generation.service.js';

@Injectable()
export class ArchiveGenerationWorker implements OnModuleDestroy {
  private readonly worker: Worker<GenerateArchiveJobData>;

  constructor(
    archiveGenerationService: ArchiveGenerationService,
    @Inject(QUEUE_CONFIG) queueConfig: QueueInfrastructureConfig,
  ) {
    this.worker = new Worker<GenerateArchiveJobData>(
      ARCHIVE_GENERATION_QUEUE_NAME,
      async (job) => archiveGenerationService.process(job.data),
      { connection: queueConfig.connection },
    );
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker.close();
  }
}
