import { PortfolioPublicationService } from '../src/portfolio/portfolio-publication.service.js';
import { PortfolioPublicReader } from '../src/portfolio/portfolio-public-reader.js';
import { PortfolioPublicMapper } from '../src/portfolio/portfolio-public.mapper.js';
import type { StorageService } from '../src/storage/storage.service.js';
import { PortfolioAdminService } from '../src/portfolio/portfolio-admin.service.js';
import { ConfigService } from '@nestjs/config';
import { afterAll, beforeAll, describe, expect, it, jest } from '@jest/globals';
import { ConflictException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { PortfolioPersistenceService } from '../src/portfolio/persistence/portfolio-persistence.service.js';
import { homeDraftFixture, serviceDraftFixture } from './portfolio-contract.fixtures.js';
import {
  parsePortfolioSnapshot,
  snapshotJson,
} from '../src/portfolio/persistence/portfolio-snapshot.js';

// Explicit dedicated local DB only. No dotenv, no migrations, no production fallback.
function testDatabaseUrl(): string {
  const raw = process.env.PORTFOLIO_TEST_DATABASE_URL;
  if (!raw)
    throw new Error(
      'Set PORTFOLIO_TEST_DATABASE_URL to a dedicated migrated local *_test database',
    );
  const url = new URL(raw);
  if (
    !['postgres:', 'postgresql:'].includes(url.protocol) ||
    !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
    !/^\/[a-z0-9_]+_test$/.test(url.pathname) ||
    (url.searchParams.has('schema') && url.searchParams.get('schema') !== 'public')
  )
    throw new Error('Portfolio integration checks require a dedicated local *_test database');
  return raw;
}

describe('Portfolio persistence on migrated PostgreSQL', () => {
  let prisma: PrismaClient;
  let persistence: PortfolioPersistenceService;
  const runId = randomUUID();
  const serviceId = randomUUID();
  const mediaId = randomUUID();
  const secondMediaId = randomUUID();
  const changedVersions: bigint[] = [];
  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url: testDatabaseUrl() } } });
    persistence = new PortfolioPersistenceService(prisma as PrismaService);
    await prisma.$connect();
    await prisma.user.create({
      data: {
        id: runId,
        email: `${runId}@portfolio.invalid`,
        passwordHash: 'unused-integration-fixture',
      },
    });
    await prisma.portfolioService.create({ data: { id: serviceId, slug: `test-${runId}` } });
    await prisma.portfolioMedia.createMany({
      data: [mediaId, secondMediaId].map((id) => ({
        id,
        uploadedById: runId,
        filename: 'synthetic.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: 123n,
      })),
    });
  });
  afterAll(async () => {
    if (!prisma) return;
    try {
      // Only rows belonging to this suite; never truncate or reset shared singletons.
      await prisma.portfolioPublishedDocument.deleteMany({
        where: { entityType: 'SERVICE', entityId: serviceId },
      });
      await prisma.portfolioService.deleteMany({ where: { id: serviceId } });
      await prisma.portfolioMediaVariant.deleteMany({
        where: { mediaId: { in: [mediaId, secondMediaId] } },
      });
      await prisma.portfolioMedia.deleteMany({ where: { id: { in: [mediaId, secondMediaId] } } });
      await prisma.portfolioCacheInvalidation.deleteMany({
        where: { contentVersion: { in: changedVersions } },
      });
      await prisma.user.deleteMany({ where: { id: runId } });
    } finally {
      await prisma.$disconnect();
    }
  });

  it('keeps edits private, rolls back incomplete publications and serializes archive against story publication', async () => {
    const service = randomUUID();
    const story = randomUUID();
    const media = randomUUID();
    const publication = new PortfolioPublicationService(prisma as PrismaService, persistence);
    const createDownloadUrl = jest.fn<StorageService['createDownloadUrl']>()
      .mockResolvedValue('https://storage.example/signed-derivative');
    const reader = new PortfolioPublicReader(
      prisma as PrismaService,
      new ConfigService({ SIGNED_URL_PREVIEW_TTL: '600' }),
      { createDownloadUrl },
    );
    const admin = new PortfolioAdminService(prisma as PrismaService, persistence, new ConfigService());
    const content = {
      titleUk: 'Серія', titleEn: 'Series', descriptionUk: 'Опис', descriptionEn: 'Description',
      seoTitleUk: 'Назва', seoTitleEn: 'Title', seoDescriptionUk: 'Опис', seoDescriptionEn: 'Description',
    };
    const document = () => prisma.portfolioPublishedDocument.findFirst({ where: { entityType: 'SERVICE', entityId: service } });
    const state = () => prisma.portfolioContentState.findUniqueOrThrow({ where: { id: 1 } });
    try {
      await prisma.portfolioMedia.create({ data: { id: media, uploadedById: runId, filename: 'sample.jpg', mimeType: 'image/jpeg', sizeBytes: 123n, status: 'READY' } });
      await prisma.portfolioService.create({ data: { ...content, id: service, slug: service, cardMediaId: media, cardAltEn: 'Frame', cardAltUk: 'Кадр' } });
      await expect(publication.publish('SERVICE', service, 1)).rejects.toBeInstanceOf(ConflictException);
      const key = 'portfolio/media/' + media + '/variants/' + randomUUID() + '/480.webp';
      const variant = await prisma.portfolioMediaVariant.create({ data: { mediaId: media, key, width: 480, height: 320 } });
      await expect(reader.derivative(media, variant.id)).rejects.toMatchObject({ status: 404 });
      expect(createDownloadUrl).not.toHaveBeenCalled();
      const published = await publication.publish('SERVICE', service, 1);
      changedVersions.push(BigInt(published.contentVersion));
      await expect(reader.derivative(media, variant.id)).resolves.toBe('https://storage.example/signed-derivative');
      expect(createDownloadUrl).toHaveBeenCalledWith({ key, expiresIn: 600, cacheControl: 'private, no-store' });
      await expect(reader.derivative(randomUUID(), variant.id)).rejects.toMatchObject({ status: 404 });
      expect(await prisma.portfolioCacheInvalidation.count({ where: { contentVersion: BigInt(published.contentVersion) } })).toBe(1);
      const original = await document();
      expect(original?.snapshot).toMatchObject({ data: { title: { en: 'Series' } } });
      const current = await admin.getService(service);
      expect(current.hasUnpublishedChanges).toBe(false);
      const edited = await admin.updateService(runId, service, 1, { ...current.draft, title: { uk: 'Зміна', en: '' } });
      expect(edited.hasUnpublishedChanges).toBe(true);
      const publicList = await reader.services({ locale: 'en', limit: 50 });
      expect(publicList.items.find(item => item.id === service)).toMatchObject({
        title: 'Series', cardImage: { url: '/api/public/portfolio/media/' + media + '/variants/' + variant.id },
      });
      expect(JSON.stringify(publicList)).not.toContain(key);
      const cursor = Buffer.from(JSON.stringify({
        v: 1, scope: 'services', locale: 'en', version: publicList.contentVersion, sortOrder: 0, id: service,
      })).toString('base64url');
      await expect(reader.services({ locale: 'uk', limit: 50, cursor })).rejects.toMatchObject({ status: 400 });
      expect((await reader.services({ locale: 'en', limit: 50, cursor })).items.map(item => item.id)).not.toContain(service);
      await expect(publication.publish('SERVICE', service, 2)).rejects.toBeInstanceOf(ConflictException);
      expect(await document()).toEqual(original);
      expect((await state()).contentVersion).toBe(BigInt(published.contentVersion));
      await admin.updateService(runId, service, 2, { ...edited.draft, title: { uk: 'Зміна', en: 'Revision' } });
      const preview = await publication.preview('SERVICE', service, { locale: 'uk' });
      expect(preview.page).toMatchObject({ title: 'Зміна', cardImage: { url: '/api/portfolio/media/' + media + '/variants/' + variant.id } });
      expect(await document()).toEqual(original);
      const revision = await publication.publish('SERVICE', service, 3);
      changedVersions.push(BigInt(revision.contentVersion));
      await expect(reader.services({ locale: 'en', limit: 50, cursor })).rejects.toMatchObject({ status: 409 });
      expect((await admin.getService(service)).hasUnpublishedChanges).toBe(false);
      await prisma.portfolioStory.create({ data: { ...content, id: story, slug: story, serviceId: service, subtitleUk: 'Серія', subtitleEn: 'Series', coverMediaId: media, coverAltUk: 'Кадр', coverAltEn: 'Frame' } });
      const results = await Promise.allSettled([publication.publish('STORY', story, 1), publication.archive('SERVICE', service, 3)]);
      for (const result of results) {
        if (result.status === 'fulfilled') changedVersions.push(BigInt(result.value.contentVersion));
        else expect(result.reason).toBeInstanceOf(ConflictException);
      }
      expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
      const storyWon = results[0].status === 'fulfilled';
      expect(Boolean(await document())).toBe(storyWon);
      expect(await prisma.portfolioPublishedServiceReference.count({ where: { serviceId: service } })).toBe(storyWon ? 1 : 0);
      if (!storyWon) {
        changedVersions.push(BigInt((await publication.publish('SERVICE', service, 3)).contentVersion));
        changedVersions.push(BigInt((await publication.publish('STORY', story, 1)).contentVersion));
      }
      await expect(publication.archive('SERVICE', service, 3)).rejects.toBeInstanceOf(ConflictException);
      const image = { mediaId: media, alt: { uk: 'Кадр', en: 'Frame' }, focalPoint: null };
      const settings = {
        ...homeDraftFixture,
        hero: { desktop: image, mobile: image },
        servicesSection: { ...homeDraftFixture.servicesSection, serviceIds: [service] },
        storiesSection: {
          ...homeDraftFixture.storiesSection,
          items: [{ storyId: story, caption: { uk: 'Добірка', en: 'Featured' } }],
        },
        contactSection: { ...homeDraftFixture.contactSection, background: image },
      };
      await prisma.$transaction(async tx => {
        const mapper = new PortfolioPublicMapper(tx, 'uk');
        expect((await mapper.site(settings)).booking.services).toEqual([]);
        expect(await mapper.home(settings)).toMatchObject({
          servicesSection: { items: [{ id: service, title: 'Зміна' }] },
          storiesSection: { items: [{ story: { id: story }, caption: 'Добірка' }] },
          seo: { canonicalPath: '/uk' },
        });
      });
      await expect(admin.removeService(service, 3)).rejects.toBeInstanceOf(ConflictException);
      expect((await publication.preview('STORY', story, { locale: 'en' })).page).toMatchObject({ title: 'Series' });
      changedVersions.push(BigInt((await publication.archive('STORY', story, 1)).contentVersion));
      changedVersions.push(BigInt((await publication.archive('SERVICE', service, 3)).contentVersion));
      const archived = await state();
      await expect(reader.derivative(media, variant.id)).rejects.toMatchObject({ status: 404 });
      await expect(reader.story(story, 'en')).rejects.toMatchObject({ status: 404 });
      expect((await publication.archive('SERVICE', service, 3)).contentVersion).toBe(Number(archived.contentVersion));
    } finally {
      await prisma.portfolioPublishedDocument.deleteMany({ where: { entityId: { in: [story, service] } } });
      await prisma.portfolioStory.deleteMany({ where: { id: story } });
      await prisma.portfolioService.deleteMany({ where: { id: service } });
      await prisma.portfolioMediaVariant.deleteMany({ where: { mediaId: media } });
      await prisma.portfolioMedia.deleteMany({ where: { id: media } });
    }
  }, 30000);
  it('has migration-seeded singleton fence/settings and rejects a second settings row', async () => {
    expect(await prisma.portfolioContentState.count()).toBe(1);
    expect(await prisma.portfolioSettings.count()).toBe(1);
    await expect(prisma.portfolioSettings.create({ data: { id: randomUUID() } })).rejects.toThrow();
  });

  it('rolls back a draft-version claim and outbox when a later write fails', async () => {
    const stateBefore = await prisma.portfolioContentState.findUniqueOrThrow({ where: { id: 1 } });
    const entityBefore = await prisma.portfolioService.findUniqueOrThrow({
      where: { id: serviceId },
    });
    await expect(
      persistence.withContentLock(async (tx) => {
        await persistence.claimDraftVersion(
          tx,
          'SERVICE',
          serviceId,
          Number(entityBefore.draftVersion),
        );
        await persistence.advanceContentVersion(tx);
        throw new Error('synthetic transaction failure');
      }),
    ).rejects.toThrow('synthetic transaction failure');
    expect(
      (await prisma.portfolioService.findUniqueOrThrow({ where: { id: serviceId } })).draftVersion,
    ).toBe(entityBefore.draftVersion);
    expect(
      (await prisma.portfolioContentState.findUniqueOrThrow({ where: { id: 1 } })).contentVersion,
    ).toBe(stateBefore.contentVersion);
    expect(
      await prisma.portfolioCacheInvalidation.count({
        where: { contentVersion: stateBefore.contentVersion + 1n },
      }),
    ).toBe(0);
  });

  it('accepts only one concurrent editor using the same expectedVersion', async () => {
    const version = Number(
      (await prisma.portfolioService.findUniqueOrThrow({ where: { id: serviceId } })).draftVersion,
    );
    const results = await Promise.allSettled(
      [0, 1].map(() =>
        persistence.withContentLock((tx) =>
          persistence.claimDraftVersion(tx, 'SERVICE', serviceId, version),
        ),
      ),
    );
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((result) => result.status === 'rejected');
    expect(rejected?.status === 'rejected' && rejected.reason).toBeInstanceOf(ConflictException);
  });

  it('retains published media FKs after draft edits and replaces them only with a newer snapshot', async () => {
    const sourceVersion = Number(
      (await prisma.portfolioService.findUniqueOrThrow({ where: { id: serviceId } })).draftVersion,
    );
    const image = { mediaId, alt: { uk: 'Кадр', en: 'Frame' }, focalPoint: null };
    const snapshot = {
      schemaVersion: 1,
      entityType: 'SERVICE',
      data: { ...serviceDraftFixture, cardImage: image },
    };
    const { document, contentVersion } = await persistence.withContentLock(async (tx) => {
      const document = await persistence.writeSnapshot(tx, serviceId, sourceVersion, snapshot);
      return { document, contentVersion: await persistence.advanceContentVersion(tx) };
    });
    changedVersions.push(contentVersion);
    await prisma.portfolioService.update({
      where: { id: serviceId },
      data: { cardMediaId: secondMediaId },
    });
    await expect(prisma.portfolioMedia.delete({ where: { id: mediaId } })).rejects.toMatchObject({
      code: 'P2003',
    });
    const replay = await persistence.withContentLock((tx) =>
      persistence.writeSnapshot(tx, serviceId, sourceVersion, snapshot),
    );
    expect(replay.publishedAt).toEqual(document.publishedAt);
    await expect(
      persistence.withContentLock((tx) =>
        persistence.writeSnapshot(tx, serviceId, sourceVersion, {
          ...snapshot,
          data: { ...snapshot.data, cardImage: { ...image, mediaId: secondMediaId } },
        }),
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    const changedSnapshot = await parsePortfolioSnapshot({
      ...snapshot,
      data: { ...snapshot.data, title: { uk: 'Зміна', en: 'Changed' } },
    });
    await expect(
      prisma.portfolioPublishedDocument.update({
        where: { id: document.id },
        data: { snapshot: snapshotJson(changedSnapshot) },
      }),
    ).rejects.toThrow();
    const replacementVersion = await persistence.withContentLock(async (tx) => {
      await persistence.claimDraftVersion(tx, 'SERVICE', serviceId, sourceVersion);
      await persistence.writeSnapshot(tx, serviceId, sourceVersion + 1, {
        ...snapshot,
        data: { ...snapshot.data, cardImage: { ...image, mediaId: secondMediaId } },
      });
      return persistence.advanceContentVersion(tx);
    });
    changedVersions.push(replacementVersion);
    expect(
      await prisma.portfolioPublishedMediaReference.count({
        where: { documentId: document.id, mediaId },
      }),
    ).toBe(0);
  });

  it('enforces slug uniqueness, real FKs, version/money bounds and immutable variants', async () => {
    const service = await prisma.portfolioService.findUniqueOrThrow({ where: { id: serviceId } });
    await expect(
      prisma.portfolioService.create({ data: { slug: service.slug } }),
    ).rejects.toMatchObject({ code: 'P2002' });
    await expect(
      prisma.portfolioService.update({
        where: { id: serviceId },
        data: { cardMediaId: randomUUID() },
      }),
    ).rejects.toMatchObject({ code: 'P2003' });
    await expect(
      prisma.portfolioService.update({ where: { id: serviceId }, data: { draftVersion: 0n } }),
    ).rejects.toThrow();
    await expect(
      prisma.portfolioService.update({ where: { id: serviceId }, data: { amountMinor: 10 } }),
    ).rejects.toThrow();
    const variant = await prisma.portfolioMediaVariant.create({
      data: { mediaId, key: `portfolio/media/${mediaId}/test.webp`, width: 480, height: 720 },
    });
    await expect(
      prisma.portfolioMediaVariant.update({ where: { id: variant.id }, data: { width: 960 } }),
    ).rejects.toThrow();
    await prisma.portfolioService.update({
      where: { id: serviceId },
      data: {
        status: 'PUBLISHED',
        publishedVersion: service.draftVersion,
        publishedAt: new Date(),
      },
    });
    await expect(
      prisma.portfolioService.update({
        where: { id: serviceId },
        data: { slug: `changed-${runId}` },
      }),
    ).rejects.toThrow();
  });
});
