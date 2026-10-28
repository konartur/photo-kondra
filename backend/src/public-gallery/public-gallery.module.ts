import { Module } from '@nestjs/common';
import { ArchivesModule } from '../archives/archives.module.js';
import { PublicArchivesController } from './public-archives.controller.js';
import { PublicArchivesService } from './public-archives.service.js';
import { GalleryAccessModule } from '../gallery-access/gallery-access.module.js';
import { StorageModule } from '../storage/storage.module.js';
import { PublicGalleryController } from './public-gallery.controller.js';
import { PublicPhotoController } from './public-photo.controller.js';
import { PublicGalleryService } from './public-gallery.service.js';

@Module({
  imports: [GalleryAccessModule, StorageModule, ArchivesModule],
  controllers: [PublicGalleryController, PublicPhotoController, PublicArchivesController],
  providers: [PublicGalleryService, PublicArchivesService],
})
export class PublicGalleryModule {}
