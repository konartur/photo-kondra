import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { DelayedError, Worker } from 'bullmq';
import { ARCHIVE_GENERATION_QUEUE_NAME } from '../queues/queue.constants.js';
import type { GenerateArchiveJobData } from '../queues/queue.constants.js';
import { QUEUE_CONFIG } from '../queues/queue.config.js';
import type { QueueInfrastructureConfig } from '../queues/queue.config.js';
import { ArchiveGenerationService } from './archive-generation.service.js';
import { ArchiveLeaseBusyError } from './archive-lease-busy.error.js';

@Injectable()
export class ArchiveGenerationWorker implements OnModuleDestroy {
  private readonly worker: Worker<GenerateArchiveJobData>;
  private readonly logger = new Logger(ArchiveGenerationWorker.name);

  constructor(
    archiveGenerationService: ArchiveGenerationService,
    @Inject(QUEUE_CONFIG) queueConfig: QueueInfrastructureConfig,
  ) {
    this.worker = new Worker<GenerateArchiveJobData>(
      ARCHIVE_GENERATION_QUEUE_NAME,
      async (job, token) => {
        try {
          await archiveGenerationService.process(job.data, async (progress) =>
            job.updateProgress(progress),
          );
        } catch (error) {
          if (!(error instanceof ArchiveLeaseBusyError)) throw error;
          await job.moveToDelayed(error.retryAt, token);
          throw new DelayedError();
        }
      },
      { connection: queueConfig.connection },
    );
    this.worker.on('error', () => this.logger.error({ event: 'archive_worker_error' }));
    this.worker.on('failed', (job) =>
      this.logger.warn({
        event: 'archive_job_failed',
        jobId: job?.id,
        attemptsMade: job?.attemptsMade,
      }),
    );
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker.close();
  }
}
