import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { beforeAll, afterAll, describe, expect, it, jest } from '@jest/globals';
import { config } from 'dotenv';
import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import * as argon2 from 'argon2';
import sharp from 'sharp';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { STORAGE_SERVICE, StorageService } from '../src/storage/storage.service.js';
import { IMAGE_PROCESSING_QUEUE, ARCHIVE_GENERATION_QUEUE } from '../src/queues/queue.constants.js';
import { ImageProcessingWorker } from '../src/image-processing/image-processing.worker.js';
import { ArchiveGenerationWorker } from '../src/archives/archive-generation.worker.js';
import { ImageProcessingService } from '../src/image-processing/image-processing.service.js';
import { ArchiveGenerationService } from '../src/archives/archive-generation.service.js';
import { setupApp } from '../src/setup-app.js';
import { createCorsOptions } from '../src/cors.config.js';
import { createHttpSecurityConfig } from '../src/common/http-security.config.js';

config({ path: '../.env', quiet: true });
describe('real product controllers/services with HTTP security enabled', () => {
  const prisma = new PrismaService();
  const ownerId = randomUUID(),
    password = randomUUID(),
    email = `${ownerId}@security.integration.invalid`;
  const objects = new Map<string, Buffer>();
  const imageAdd = jest.fn();
  const settings = new ConfigService({
    JWT_ACCESS_SECRET: randomUUID() + randomUUID(),
    JWT_REFRESH_SECRET: randomUUID() + randomUUID(),
    JWT_ACCESS_TTL: '15m',
    JWT_REFRESH_TTL: '7d',
    APP_URL: 'https://photos.example',
    REDIS_HOST: 'localhost',
    REDIS_PORT: '6379',
    MAX_PHOTO_SIZE: '26214400',
    SIGNED_URL_UPLOAD_TTL: '900',
    SIGNED_URL_PREVIEW_TTL: '900',
    SIGNED_URL_ORIGINAL_TTL: '300',
    SIGNED_URL_ARCHIVE_TTL: '900',
  });
  const storage: StorageService = {
    createUploadUrl: async () => 'https://storage.example/upload-signed',
    createDownloadUrl: async ({ key, filename }) => {
      if (!objects.has(key)) throw new Error('Missing test object');
      return `https://storage.example/download-signed?filename=${encodeURIComponent(filename ?? 'preview.webp')}`;
    },
    exists: async (key) => objects.has(key),
    download: async (key) => {
      const bytes = objects.get(key);
      if (!bytes) throw new Error('Missing test object');
      return Readable.from([bytes]);
    },
    upload: async ({ key, body }) => {
      if (Buffer.isBuffer(body)) {
        objects.set(key, body);
        return;
      }
      const chunks: Buffer[] = [];
      for await (const chunk of body) chunks.push(Buffer.from(chunk));
      objects.set(key, Buffer.concat(chunks));
    },
    delete: async (key) => {
      objects.delete(key);
    },
  };
  let app: INestApplication;
  let images: ImageProcessingService;
  let archives: ArchiveGenerationService;
  beforeAll(async () => {
    await prisma.$connect();
    await prisma.user.create({
      data: { id: ownerId, email, passwordHash: await argon2.hash(password) },
    });
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .overrideProvider(ConfigService)
      .useValue(settings)
      .overrideProvider(STORAGE_SERVICE)
      .useValue(storage)
      .overrideProvider(IMAGE_PROCESSING_QUEUE)
      .useValue({ add: imageAdd, close: jest.fn() })
      .overrideProvider(ARCHIVE_GENERATION_QUEUE)
      .useValue({ add: jest.fn(), close: jest.fn() })
      .overrideProvider(ImageProcessingWorker)
      .useValue({ onModuleDestroy: jest.fn() })
      .overrideProvider(ArchiveGenerationWorker)
      .useValue({ onModuleDestroy: jest.fn() })
      .compile();
    images = module.get(ImageProcessingService);
    archives = module.get(ArchiveGenerationService);
    app = module.createNestApplication({ bodyParser: false });
    setupApp(app, true, createCorsOptions('https://photos.example'), createHttpSecurityConfig({}));
    await app.init();
  });
  afterAll(async () => {
    await prisma.gallery.deleteMany({ where: { ownerId } });
    await prisma.user.deleteMany({ where: { id: ownerId } });
    await app?.close();
    await prisma.$disconnect();
  });

  it('preserves login, direct upload, Sharp processing, private viewing, original/ZIP downloads, refresh and logout', async () => {
    const http = request(app.getHttpServer());
    await http.get('/api/v1/galleries').expect(401);
    const login = await http.post('/api/v1/auth/login').send({ email, password }).expect(201);
    const bearer = `Bearer ${login.body.accessToken}`;
    await http.get('/api/v1/auth/me').set('Authorization', bearer).expect(200);
    await http
      .post('/api/v1/galleries')
      .set('Authorization', bearer)
      .send({ title: 'Security flow', ownerId: 'forbidden' })
      .expect(400);
    const gallery = await http
      .post('/api/v1/galleries')
      .set('Authorization', bearer)
      .send({ title: 'Security flow' })
      .expect(201);
    const galleryId = gallery.body.id as string;
    const original = await sharp({
      create: { width: 32, height: 24, channels: 3, background: '#336699' },
    })
      .jpeg()
      .toBuffer();
    const upload = await http
      .post(`/api/v1/galleries/${galleryId}/photos/upload-url`)
      .set('Authorization', bearer)
      .send({ filename: 'original.jpg', mimeType: 'image/jpeg', size: original.length })
      .expect(201);
    expect(upload.body.uploadUrl).toBe('https://storage.example/upload-signed');
    const photoId = upload.body.photoId as string;
    const uploading = await prisma.photo.findUniqueOrThrow({ where: { id: photoId } });
    objects.set(uploading.originalKey!, original); // Simulate browser PUT directly into private storage.
    await http
      .post(`/api/v1/photos/${photoId}/upload-complete`)
      .set('Authorization', bearer)
      .expect(201);
    expect(imageAdd).toHaveBeenCalledWith('process-photo', { photoId });
    await images.process({ photoId });
    expect((await prisma.photo.findUniqueOrThrow({ where: { id: photoId } })).status).toBe('READY');
    await http
      .post(`/api/v1/galleries/${galleryId}/publish`)
      .set('Authorization', bearer)
      .expect(202);
    const preparing = await http
      .get(`/api/v1/galleries/${galleryId}/archive`)
      .set('Authorization', bearer)
      .expect(200);
    await archives.process({ archiveId: preparing.body.id as string });
    const link = await http
      .post(`/api/v1/galleries/${galleryId}/access-links`)
      .set('Authorization', bearer)
      .send({})
      .expect(201);
    const token = new URL(link.body.url as string).pathname.split('/').pop()!;
    // A database ID is never a substitute for the private bearer token.
    await http.get(`/api/v1/public/galleries/${galleryId}`).expect(404);
    await http.get(`/api/v1/public/galleries/${photoId}`).expect(404);
    await http.get(`/api/v1/galleries/${galleryId}`).expect(401);
    const foreignGallery = await prisma.gallery.create({
      data: { ownerId, title: 'Other private gallery', status: 'READY' },
    });
    const foreignPhoto = await prisma.photo.create({
      data: {
        galleryId: foreignGallery.id,
        filename: 'other.jpg',
        mimeType: 'image/jpeg',
        size: original.length,
        status: 'READY',
        originalKey: `idor-test/${randomUUID()}.jpg`,
      },
    });
    objects.set(foreignPhoto.originalKey!, original);
    const foreignArchive = await prisma.archive.create({ data: { galleryId: foreignGallery.id } });
    await http.get(`/api/v1/public/galleries/${foreignGallery.id}`).expect(404);
    const deniedPhoto = await http
      .get(`/api/v1/public/photos/${token}/${foreignPhoto.id}/download`)
      .expect(404);
    expect(deniedPhoto.body).not.toHaveProperty('downloadUrl');
    await http.get(`/api/v1/public/archives/${foreignArchive.id}?token=${token}`).expect(404);
    await http.get(`/api/v1/public/archives/${foreignArchive.id}`).expect(400);
    await http
      .post(`/api/v1/public/galleries/${token}/archives`)
      .send({ photoIds: [foreignPhoto.id] })
      .expect(400);
    const publicGallery = await http
      .get(`/api/v1/public/galleries/${token}`)
      .set('Origin', 'https://photos.example')
      .expect(200);
    expect(publicGallery.headers['access-control-allow-origin']).toBe('https://photos.example');
    expect(publicGallery.headers['x-content-type-options']).toBe('nosniff');
    const photos = await http.get(`/api/v1/public/galleries/${token}/photos?limit=1`).expect(200);
    expect(photos.body.items[0].id).toBe(photoId);
    expect(photos.body.items[0]).not.toHaveProperty('originalKey');
    const download = await http
      .get(`/api/v1/public/photos/${token}/${photoId}/download`)
      .expect(200);
    expect(download.body.downloadUrl).toContain('original.jpg');
    await http.get(`/api/v1/public/galleries/${token}/archive`).expect(200);
    const selected = await http
      .post(`/api/v1/public/galleries/${token}/archives`)
      .send({ photoIds: [photoId] })
      .expect(202);
    await archives.process({ archiveId: selected.body.id as string });
    const ready = await http
      .get(`/api/v1/public/archives/${selected.body.id}?token=${token}`)
      .expect(200);
    expect(ready.body.status).toBe('READY');
    const refresh = await http
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: login.body.refreshToken })
      .expect(200);
    await http
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${refresh.body.accessToken}`)
      .expect(204);
    await http
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: refresh.body.refreshToken })
      .expect(401);
  });
});
