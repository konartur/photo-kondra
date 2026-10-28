import 'reflect-metadata';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it, jest } from '@jest/globals';
import { config } from 'dotenv';
import { createHash, randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import type { Queue } from 'bullmq';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { ArchivesService } from '../src/archives/archives.service.js';
import { ArchiveGenerationService } from '../src/archives/archive-generation.service.js';
import { GalleriesService } from '../src/galleries/galleries.service.js';
import { PhotosService } from '../src/photos/photos.service.js';
import { GalleryAccessService } from '../src/gallery-access/gallery-access.service.js';
import type { StorageService } from '../src/storage/storage.service.js';
import type { GenerateArchiveJobData } from '../src/queues/queue.constants.js';
import { PublicArchivesController } from '../src/public-gallery/public-archives.controller.js';
import { PublicArchivesService } from '../src/public-gallery/public-archives.service.js';

config({ path: '../.env', quiet: true });
describe('publish -> prebuilt ZIP -> immediate client download', () => {
  const prisma = new PrismaService();
  const add = jest.fn();
  const queue = { add } as unknown as Queue<GenerateArchiveJobData>;
  const archives = new ArchivesService(prisma, queue);
  const galleries = new GalleriesService(prisma, archives);
  const settings = new ConfigService({ SIGNED_URL_ARCHIVE_TTL: '3600' });
  const access = new GalleryAccessService(prisma, galleries, settings);
  const objects = new Map<string, Buffer>();
  const exists = jest.fn<StorageService['exists']>().mockResolvedValue(true);
  const storage: StorageService = {
    exists,
    createUploadUrl: async () => 'https://signed.example/upload',
    download: async () => Readable.from([Buffer.from('original')]),
    upload: async ({ key, body }) => {
      const parts: Buffer[] = [];
      for await (const chunk of body) parts.push(Buffer.from(chunk));
      objects.set(key, Buffer.concat(parts));
    },
    delete: async (key) => {
      objects.delete(key);
    },
    createDownloadUrl: async ({ key }) => {
      if (!objects.has(key)) throw new Error('ZIP object is missing');
      return 'https://signed.example/gallery.zip';
    },
  };
  const worker = new ArchiveGenerationService(prisma, storage, {
    lockTtlSeconds: 60,
    retentionSeconds: 86400,
    maxSize: 1048576,
  });
  const photos = new PhotosService(
    prisma,
    galleries,
    storage,
    { add: jest.fn() } as unknown as Queue,
    settings,
  );
  const service = new PublicArchivesService(prisma, access, archives, storage, settings);
  const token = randomUUID(),
    expiredToken = randomUUID(),
    ownerId = randomUUID(),
    galleryId = randomUUID(),
    photoId = randomUUID();
  let app: INestApplication;
  let archiveId: string;

  beforeAll(async () => {
    await prisma.$connect();
    await prisma.user.create({
      data: {
        id: ownerId,
        email: `${ownerId}@integration.invalid`,
        passwordHash: 'unused-test-hash',
      },
    });
    await prisma.gallery.create({
      data: { id: galleryId, title: 'Prebuilt ZIP integration', ownerId },
    });
    await prisma.photo.create({
      data: {
        id: photoId,
        galleryId,
        filename: 'a.jpg',
        mimeType: 'image/jpeg',
        size: 8n,
        status: 'READY',
        originalKey: 'integration/original',
      },
    });
    await prisma.galleryAccess.createMany({
      data: [
        { galleryId, tokenHash: createHash('sha256').update(token).digest('hex') },
        {
          galleryId,
          tokenHash: createHash('sha256').update(expiredToken).digest('hex'),
          expiresAt: new Date(0),
        },
      ],
    });
    const module = await Test.createTestingModule({
      controllers: [PublicArchivesController],
      providers: [{ provide: PublicArchivesService, useValue: service }],
    }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
  });
  afterAll(async () => {
    await app?.close();
    await prisma.gallery.deleteMany({ where: { id: galleryId } });
    await prisma.user.deleteMany({ where: { id: ownerId } });
    await prisma.$disconnect();
  });

  it('does not let clients create archives or access an unpublished gallery', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/public/galleries/${token}/archive`)
      .expect(404);
    await request(app.getHttpServer()).get(`/api/v1/public/galleries/${token}/archive`).expect(404);
    expect(add).not.toHaveBeenCalled();
    expect(await prisma.archive.count({ where: { galleryId } })).toBe(0);
    await expect(archives.publish('wrong-owner', galleryId)).rejects.toThrow('Gallery not found');
  });
  it('waits for ALL uploads and refuses manual READY or sharing before ZIP preparation', async () => {
    const unfinished = await prisma.photo.create({
      data: {
        galleryId,
        filename: 'upload.jpg',
        mimeType: 'image/jpeg',
        size: 1n,
        status: 'UPLOADING',
      },
    });
    try {
      await expect(galleries.publish(ownerId, galleryId)).rejects.toThrow(
        'Wait until all photos are ready',
      );
    } finally {
      await prisma.photo.delete({ where: { id: unfinished.id } });
    }
    await expect(galleries.transitionStatus(ownerId, galleryId, 'READY')).rejects.toThrow(
      'Cannot transition',
    );
    await expect(access.create(ownerId, galleryId, {})).rejects.toThrow('Publish gallery');
  });
  it('deduplicates six concurrent admin publications and stays PROCESSING until ZIP is uploaded', async () => {
    await Promise.all(Array.from({ length: 6 }, () => galleries.publish(ownerId, galleryId)));
    const rows = await prisma.archive.findMany({ where: { galleryId } });
    expect(rows).toHaveLength(1);
    archiveId = rows[0]!.id;
    expect(add.mock.calls.every((call) => (call[2] as { jobId: string }).jobId === archiveId)).toBe(
      true,
    );
    expect((await galleries.findOne(ownerId, galleryId)).status).toBe('PROCESSING');
    await request(app.getHttpServer()).get(`/api/v1/public/galleries/${token}/archive`).expect(404);
  });
  it('publishes only after storing ZIP, without automatic archive expiry', async () => {
    await worker.process({ archiveId });
    const archive = await prisma.archive.findUniqueOrThrow({ where: { id: archiveId } });
    expect(archive.status).toBe('READY');
    expect(archive.expiresAt).toBeNull();
    expect(objects.get(archive.storageKey!)?.subarray(0, 2).toString()).toBe('PK');
    expect((await galleries.findOne(ownerId, galleryId)).status).toBe('READY');
    const before = add.mock.calls.length;
    const result = await request(app.getHttpServer())
      .get(`/api/v1/public/galleries/${token}/archive`)
      .expect(200);
    expect(result.body.downloadUrl).toBe('https://signed.example/gallery.zip');
    expect(result.body).not.toHaveProperty('storageKey');
    expect(result.headers['cache-control']).toBe('no-store');
    await request(app.getHttpServer())
      .get(`/api/v1/public/archives/${archiveId}?token=${token}`)
      .expect(200);
    expect(add).toHaveBeenCalledTimes(before);
  });
  it('freezes photos after publication and reuses the already built ZIP on republication', async () => {
    await expect(photos.update(ownerId, photoId, { sortOrder: 1 })).rejects.toThrow(
      'Return gallery to draft',
    );
    await expect(photos.remove(ownerId, photoId)).rejects.toThrow('Return gallery to draft');
    const before = add.mock.calls.length;
    await galleries.publish(ownerId, galleryId);
    expect(add).toHaveBeenCalledTimes(before);
    expect((await archives.current(galleryId))?.id).toBe(archiveId);
  });
  it('unpublishes for edits, prepares a new version and rejects download of old ZIP versions', async () => {
    await galleries.transitionStatus(ownerId, galleryId, 'DRAFT');
    await request(app.getHttpServer()).get(`/api/v1/public/galleries/${token}/archive`).expect(404);
    await photos.update(ownerId, photoId, { sortOrder: 1 });
    await galleries.publish(ownerId, galleryId);
    const next = await archives.current(galleryId);
    expect(next?.id).not.toBe(archiveId);
    await worker.process({ archiveId: next!.id });
    await request(app.getHttpServer())
      .get(`/api/v1/public/archives/${archiveId}?token=${token}`)
      .expect(404);
    archiveId = next!.id;
    await request(app.getHttpServer()).get(`/api/v1/public/galleries/${token}/archive`).expect(200);
  });
  it('keeps a failed publication private and allows an admin to retry', async () => {
    await galleries.transitionStatus(ownerId, galleryId, 'DRAFT');
    await photos.update(ownerId, photoId, { sortOrder: 2 });
    await galleries.publish(ownerId, galleryId);
    const failing = await archives.current(galleryId);
    exists.mockResolvedValue(false);
    await expect(worker.process({ archiveId: failing!.id })).rejects.toThrow('original is missing');
    expect((await galleries.findOne(ownerId, galleryId)).status).toBe('PROCESSING');
    await request(app.getHttpServer()).get(`/api/v1/public/galleries/${token}/archive`).expect(404);
    exists.mockResolvedValue(true);
    await galleries.publish(ownerId, galleryId);
    const retried = await archives.current(galleryId);
    expect(retried?.id).not.toBe(failing?.id);
    await worker.process({ archiveId: retried!.id });
    archiveId = retried!.id;
    expect((await galleries.findOne(ownerId, galleryId)).status).toBe('READY');
  });
  it('does not publish a canceled gallery when its already running ZIP finishes', async () => {
    await galleries.transitionStatus(ownerId, galleryId, 'DRAFT');
    await photos.update(ownerId, photoId, { sortOrder: 3 });
    await galleries.publish(ownerId, galleryId);
    const canceled = await archives.current(galleryId);
    await galleries.transitionStatus(ownerId, galleryId, 'DRAFT');
    await worker.process({ archiveId: canceled!.id });
    expect((await galleries.findOne(ownerId, galleryId)).status).toBe('DRAFT');
    await request(app.getHttpServer()).get(`/api/v1/public/galleries/${token}/archive`).expect(404);
    await galleries.publish(ownerId, galleryId);
    archiveId = canceled!.id;
    expect((await galleries.findOne(ownerId, galleryId)).status).toBe('READY');
    await expect(access.create(ownerId, galleryId, {})).resolves.toHaveProperty('url');
  });

  it('checks missing proof, expired/revoked tokens and gallery ownership on every download', async () => {
    await request(app.getHttpServer()).get(`/api/v1/public/archives/${archiveId}`).expect(400);
    await request(app.getHttpServer())
      .get(`/api/v1/public/archives/${archiveId}?token=invalid`)
      .expect(404);
    await request(app.getHttpServer())
      .get(`/api/v1/public/archives/${archiveId}?token=${expiredToken}`)
      .expect(404);
    const other = await prisma.gallery.create({
      data: { title: 'Other', ownerId, status: 'READY' },
    });
    const otherToken = randomUUID();
    try {
      await prisma.galleryAccess.create({
        data: {
          galleryId: other.id,
          tokenHash: createHash('sha256').update(otherToken).digest('hex'),
        },
      });
      await request(app.getHttpServer())
        .get(`/api/v1/public/archives/${archiveId}?token=${otherToken}`)
        .expect(404);
    } finally {
      await prisma.gallery.delete({ where: { id: other.id } });
    }
    await prisma.galleryAccess.updateMany({ where: { galleryId }, data: { isActive: false } });
    await request(app.getHttpServer())
      .get(`/api/v1/public/archives/${archiveId}?token=${token}`)
      .expect(404);
  });
});
