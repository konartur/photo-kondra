import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { GalleriesModule } from '../galleries/galleries.module.js';
import { QueuesModule } from '../queues/queues.module.js';
import { StorageModule } from '../storage/storage.module.js';
import { PhotosController } from './photos.controller.js';
import { PhotosService } from './photos.service.js';

@Module({
  imports: [AuthModule, GalleriesModule, StorageModule, QueuesModule],
  controllers: [PhotosController],
  providers: [PhotosService],
})
export class PhotosModule {}
