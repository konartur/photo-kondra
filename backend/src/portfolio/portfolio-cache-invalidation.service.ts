import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { AppLogger } from '../common/logging/app-logger.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { PortfolioPublicCache } from './portfolio-public-cache.js';

@Injectable()
export class PortfolioCacheInvalidationService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new AppLogger(PortfolioCacheInvalidationService.name);
  private timer?: ReturnType<typeof setInterval>;
  private running?: Promise<void>;
  private requested = false;
  private stopped = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: PortfolioPublicCache,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => this.kick(), 5000);
    this.timer.unref();
    this.kick();
  }

  /** Invoked only after commit. The database scanner also recovers missed signals. */
  kick() {
    if (this.stopped) return;
    this.requested = true;
    if (!this.running) {
      this.running = this.drain().finally(() => {
        this.running = undefined;
      });
    }
  }

  private async drain() {
    while (this.requested && !this.stopped) {
      this.requested = false;
      try {
        await this.sweep();
      } catch {
        this.logger.warn({ event: 'portfolio_cache_outbox_deferred' });
      }
    }
  }

  async sweep() {
    const rows = await this.prisma.portfolioCacheInvalidation.findMany({
      where: { processedAt: null, nextAttemptAt: { lte: new Date() } },
      orderBy: { contentVersion: 'desc' },
      take: 16,
    });
    for (const row of rows) {
      try {
        await this.cache.invalidate(row.contentVersion);
      } catch {
        const seconds = Math.min(300, 2 ** Math.min(9, row.attempts + 1));
        await this.prisma.portfolioCacheInvalidation.updateMany({
          where: { id: row.id, processedAt: null, attempts: row.attempts },
          data: {
            attempts: { increment: 1 },
            nextAttemptAt: new Date(Date.now() + seconds * 1000),
          },
        });
        this.logger.warn({
          event: 'portfolio_cache_invalidation_retry',
          attemptsMade: row.attempts + 1,
        });
        continue;
      }
      await this.prisma.portfolioCacheInvalidation.updateMany({
        where: { id: row.id, processedAt: null },
        data: { processedAt: new Date() },
      });
      this.logger.debug({ event: 'portfolio_cache_invalidated' });
    }
  }

  async onModuleDestroy() {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    await this.running;
  }
}
