import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { QUEUE_CONFIG } from '../queues/queue.config.js';
import type { QueueInfrastructureConfig } from '../queues/queue.config.js';
import { AuthModule } from '../auth/auth.module.js';
import { QueuesModule } from '../queues/queues.module.js';
import { StorageModule } from '../storage/storage.module.js';
import { PortfolioPersistenceModule } from './persistence/portfolio-persistence.module.js';
import { PortfolioMediaController } from './portfolio-media.controller.js';
import { PortfolioAdminController } from './portfolio-admin.controller.js';
import { PortfolioAdminService } from './portfolio-admin.service.js';
import { PortfolioMediaService } from './media/portfolio-media.service.js';
import { PortfolioMediaJobs } from './media/portfolio-media.jobs.js';
import { PortfolioMediaWorker } from './media/portfolio-media.worker.js';
import { PortfolioImageProcessor } from './media/portfolio-image-processor.js';
import { PortfolioMediaProcessingService } from './media/portfolio-media-processing.service.js';
import { PortfolioMediaMaintenanceService } from './media/portfolio-media-maintenance.service.js';
import { PortfolioMediaCleanupService } from './media/portfolio-media-cleanup.service.js';
import {
  createPortfolioMediaConfig,
  PORTFOLIO_MEDIA_CONFIG,
  PORTFOLIO_MEDIA_QUEUE,
  PORTFOLIO_MEDIA_QUEUE_CLIENT,
} from './media/portfolio-media.config.js';

@Module({
  imports: [AuthModule, QueuesModule, StorageModule, PortfolioPersistenceModule],
  controllers: [PortfolioMediaController, PortfolioAdminController],
  providers: [
    {
      provide: PORTFOLIO_MEDIA_QUEUE_CLIENT,
      inject: [QUEUE_CONFIG],
      useFactory: (config: QueueInfrastructureConfig) =>
        new Queue(PORTFOLIO_MEDIA_QUEUE, {
          ...config,
          connection: {
            ...config.connection,
            maxRetriesPerRequest: 1,
            enableOfflineQueue: false,
            connectTimeout: 5000,
          },
          skipWaitingForReady: true,
        }),
    },
    {
      provide: PORTFOLIO_MEDIA_CONFIG,
      inject: [ConfigService],
      useFactory: createPortfolioMediaConfig,
    },
    PortfolioMediaService,
    PortfolioAdminService,
    PortfolioMediaJobs,
    PortfolioMediaWorker,
    PortfolioImageProcessor,
    PortfolioMediaProcessingService,
    PortfolioMediaCleanupService,
    PortfolioMediaMaintenanceService,
  ],
})
export class PortfolioModule {}
