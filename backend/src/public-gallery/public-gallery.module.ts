import { Module } from '@nestjs/common';
import { GalleryAccessModule } from '../gallery-access/gallery-access.module.js';
import { StorageModule } from '../storage/storage.module.js';
import { PublicGalleryController } from './public-gallery.controller.js';
import { PublicPhotoController } from './public-photo.controller.js';
import { PublicGalleryService } from './public-gallery.service.js';

@Module({
  imports: [GalleryAccessModule, StorageModule],
  controllers: [PublicGalleryController, PublicPhotoController],
  providers: [PublicGalleryService],
})
export class PublicGalleryModule {}
