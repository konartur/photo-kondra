import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import {
  ARCHIVE_GENERATION_QUEUE,
  ARCHIVE_GENERATION_QUEUE_NAME,
  IMAGE_PROCESSING_QUEUE,
  IMAGE_PROCESSING_QUEUE_NAME,
} from './queue.constants.js';
import { createQueueInfrastructureConfig, QUEUE_CONFIG } from './queue.config.js';
import { QueuesService } from './queues.service.js';

@Module({
  providers: [
    {
      provide: QUEUE_CONFIG,
      inject: [ConfigService],
      useFactory: createQueueInfrastructureConfig,
    },
    {
      provide: IMAGE_PROCESSING_QUEUE,
      inject: [QUEUE_CONFIG],
      useFactory: (config: ReturnType<typeof createQueueInfrastructureConfig>) =>
        new Queue(IMAGE_PROCESSING_QUEUE_NAME, config),
    },
    {
      provide: ARCHIVE_GENERATION_QUEUE,
      inject: [QUEUE_CONFIG],
      useFactory: (config: ReturnType<typeof createQueueInfrastructureConfig>) =>
        new Queue(ARCHIVE_GENERATION_QUEUE_NAME, config),
    },
    QueuesService,
  ],
  exports: [IMAGE_PROCESSING_QUEUE, ARCHIVE_GENERATION_QUEUE, QUEUE_CONFIG],
})
export class QueuesModule {}
