import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AppLogger, safeErrorDetails } from '../../common/logging/app-logger.js';
import { PortfolioMediaJobs } from './portfolio-media.jobs.js';
import { PortfolioMediaCleanupService } from './portfolio-media-cleanup.service.js';
import { PORTFOLIO_MEDIA_CONFIG } from './portfolio-media.config.js';
import type { PortfolioMediaConfig } from './portfolio-media.config.js';

@Injectable()
export class PortfolioMediaMaintenanceService implements OnModuleInit, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;
  private running?: Promise<void>;
  private readonly cursors: Record<string, string | undefined> = {};
  private readonly logger = new AppLogger(PortfolioMediaMaintenanceService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly jobs: PortfolioMediaJobs,
    private readonly cleanup: PortfolioMediaCleanupService,
    @Inject(PORTFOLIO_MEDIA_CONFIG) private readonly config: PortfolioMediaConfig,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => {
      if (!this.running)
        this.running = this.sweep().finally(() => {
          this.running = undefined;
        });
    }, this.config.maintenanceIntervalSeconds * 1000);
    this.timer.unref();
  }
  async onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    await this.running;
  }

  private async sweep(): Promise<void> {
    const signal = AbortSignal.timeout(20_000);
    try {
      for (const status of ['PROCESSING', 'DELETED', 'FAILED'] as const) {
        if (signal.aborted) break;
        const rows = await this.prisma.portfolioMedia.findMany({
          where: {
            status,
            ...(this.cursors[status] ? { id: { gt: this.cursors[status] } } : {}),
            ...(status === 'PROCESSING'
              ? {
                  updatedAt: { lte: new Date(Date.now() - 10_000) },
                  OR: [
                    { processingLockExpiresAt: null },
                    { processingLockExpiresAt: { lte: new Date() } },
                  ],
                }
              : {}),
          },
          orderBy: { id: 'asc' },
          take: 50,
          select: { id: true },
        });
        for (const row of rows) {
          if (signal.aborted) break;
          try {
            if (status === 'PROCESSING') await this.jobs.ensureQueued(row.id);
            else await this.cleanup.clean(row.id, signal);
          } catch (error) {
            this.logger.warn({
              event: 'portfolio_media_cleanup_deferred',
              mediaId: row.id,
              ...safeErrorDetails(error),
            });
          }
          this.cursors[status] = row.id;
        }
        if (rows.length < 50 && !signal.aborted) this.cursors[status] = undefined;
      }
    } catch (error) {
      this.logger.warn({ event: 'portfolio_media_cleanup_deferred', ...safeErrorDetails(error) });
    }
  }
}
