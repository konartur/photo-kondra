import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { QueuesModule } from '../queues/queues.module.js';
import { StorageModule } from '../storage/storage.module.js';
import { createImageProcessingConfig, IMAGE_PROCESSING_CONFIG } from './image-processing.config.js';
import { ImageProcessingService } from './image-processing.service.js';
import { ImageProcessingWorker } from './image-processing.worker.js';

@Module({
  imports: [QueuesModule, StorageModule],
  providers: [
    {
      provide: IMAGE_PROCESSING_CONFIG,
      inject: [ConfigService],
      useFactory: createImageProcessingConfig,
    },
    ImageProcessingService,
    ImageProcessingWorker,
  ],
})
export class ImageProcessingModule {}
