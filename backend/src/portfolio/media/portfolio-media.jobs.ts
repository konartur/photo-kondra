import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';
import { logTransportError } from '../../common/logging/job-logging.js';
import { jobCorrelation } from '../../common/logging/log-context.js';
import {
  PORTFOLIO_MEDIA_QUEUE,
  PORTFOLIO_MEDIA_QUEUE_CLIENT,
  PROCESS_PORTFOLIO_MEDIA,
} from './portfolio-media.config.js';
import type { PortfolioMediaJobData } from './portfolio-media.config.js';

@Injectable()
export class PortfolioMediaJobs implements OnModuleDestroy {
  private initialized = false;

  constructor(@Inject(PORTFOLIO_MEDIA_QUEUE_CLIENT) readonly queue: Queue<PortfolioMediaJobData>) {
    this.queue.on('error', (error) =>
      logTransportError('queue_error', PORTFOLIO_MEDIA_QUEUE, error),
    );
    void queue.waitUntilReady().then(
      () => { this.initialized = true; },
      () => { /* BullMQ emits initialization errors to the listener above. */ },
    );
  }

  /** Stable per-media job ID deduplicates concurrent completion/recovery calls. */
  async ensureQueued(mediaId: string): Promise<void> {
    if (!this.initialized) throw new Error('Portfolio media queue is not ready');
    const add = () =>
      this.queue.add(PROCESS_PORTFOLIO_MEDIA, { mediaId, ...jobCorrelation() }, { jobId: mediaId });
    const existing = await this.queue.getJob(mediaId);
    if (!existing) {
      await add();
      return;
    }
    try {
      const state = await existing.getState();
      if (state === 'failed')
        await existing.retry('failed', { resetAttemptsMade: true, resetAttemptsStarted: true });
      else if (state === 'completed') {
        await existing.remove();
        await add();
      } else if (state === 'unknown') await add();
    } catch (error) {
      // Another completion/retry may already have moved this same stable ID.
      const current = await this.queue.getJob(mediaId);
      if (
        current &&
        ['active', 'waiting', 'delayed', 'prioritized'].includes(await current.getState())
      )
        return;
      throw error;
    }
  }
  async onModuleDestroy(): Promise<void> {
    await this.queue.close();
  }
}
