import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { DelayedError, Worker } from 'bullmq';
import { QUEUE_CONFIG } from '../../queues/queue.config.js';
import type { QueueInfrastructureConfig } from '../../queues/queue.config.js';
import { JobLogger, logTransportError } from '../../common/logging/job-logging.js';
import { PORTFOLIO_MEDIA_QUEUE, PortfolioMediaLeaseBusyError } from './portfolio-media.config.js';
import type { PortfolioMediaJobData } from './portfolio-media.config.js';
import { PortfolioMediaProcessingService } from './portfolio-media-processing.service.js';

@Injectable()
export class PortfolioMediaWorker implements OnModuleDestroy {
  private readonly worker: Worker<PortfolioMediaJobData>;
  private readonly logger = new JobLogger(PORTFOLIO_MEDIA_QUEUE);
  constructor(
    processing: PortfolioMediaProcessingService,
    @Inject(QUEUE_CONFIG) config: QueueInfrastructureConfig,
  ) {
    this.worker = new Worker(
      PORTFOLIO_MEDIA_QUEUE,
      async (job, token) =>
        this.logger.run(job, async () => {
          try {
            await processing.process(job.data);
          } catch (error) {
            if (!(error instanceof PortfolioMediaLeaseBusyError)) throw error;
            await job.moveToDelayed(Math.max(Date.now() + 1000, error.retryAt), token);
            throw new DelayedError();
          }
        }),
      { connection: config.connection, concurrency: 1 },
    );
    this.worker.on('failed', (job, error) => this.logger.failed(job, error));
    this.worker.on('error', (error) =>
      logTransportError('worker_error', PORTFOLIO_MEDIA_QUEUE, error),
    );
  }
  async onModuleDestroy(): Promise<void> {
    await this.worker.close();
  }
}
