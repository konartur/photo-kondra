import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { GalleriesModule } from '../galleries/galleries.module.js';
import { GalleryAccessController } from './gallery-access.controller.js';
import { GalleryAccessService } from './gallery-access.service.js';

@Module({
  imports: [AuthModule, GalleriesModule],
  controllers: [GalleryAccessController],
  providers: [GalleryAccessService],
  exports: [GalleryAccessService],
})
export class GalleryAccessModule {}
