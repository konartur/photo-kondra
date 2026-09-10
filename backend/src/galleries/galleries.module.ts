import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { GalleriesController } from './galleries.controller.js';
import { GalleriesService } from './galleries.service.js';

@Module({
  imports: [AuthModule],
  controllers: [GalleriesController],
  providers: [GalleriesService],
  exports: [GalleriesService],
})
export class GalleriesModule {}
