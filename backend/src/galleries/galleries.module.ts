import { Module } from '@nestjs/common';
import { ArchivesModule } from '../archives/archives.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { GalleriesController } from './galleries.controller.js';
import { GalleriesService } from './galleries.service.js';

@Module({
  imports: [AuthModule, ArchivesModule],
  controllers: [GalleriesController],
  providers: [GalleriesService],
  exports: [GalleriesService],
})
export class GalleriesModule {}
