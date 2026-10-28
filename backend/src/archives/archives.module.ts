import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module.js';
import { QueuesModule } from '../queues/queues.module.js';
import { StorageModule } from '../storage/storage.module.js';
import {
  ARCHIVE_GENERATION_CONFIG,
  createArchiveGenerationConfig,
} from './archive-generation.config.js';
import { ArchiveGenerationService } from './archive-generation.service.js';
import { ArchiveGenerationWorker } from './archive-generation.worker.js';

@Module({
  imports: [PrismaModule, QueuesModule, StorageModule],
  providers: [
    {
      provide: ARCHIVE_GENERATION_CONFIG,
      inject: [ConfigService],
      useFactory: createArchiveGenerationConfig,
    },
    ArchiveGenerationService,
    ArchiveGenerationWorker,
  ],
  exports: [ArchiveGenerationService],
})
export class ArchivesModule {}
