import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { StorageModule } from './storage/storage.module.js';
import { AuthModule } from './auth/auth.module.js';
import { GalleriesModule } from './galleries/galleries.module.js';
import { PhotosModule } from './photos/photos.module.js';
import { QueuesModule } from './queues/queues.module.js';
import { ImageProcessingModule } from './image-processing/image-processing.module.js';
import { GalleryAccessModule } from './gallery-access/gallery-access.module.js';
import { UsersModule } from './users/users.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['../.env', '.env'],
    }),
    PrismaModule,
    StorageModule,
    UsersModule,
    AuthModule,
    GalleriesModule,
    PhotosModule,
    QueuesModule,
    ImageProcessingModule,
    GalleryAccessModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
