import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import { PrismaClient, PortfolioEntityType } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PortfolioAdminService } from '../src/portfolio/portfolio-admin.service.js';
import { PortfolioPersistenceService } from '../src/portfolio/persistence/portfolio-persistence.service.js';
import { PortfolioPublicationService } from '../src/portfolio/portfolio-publication.service.js';
import { PortfolioPublicMapper } from '../src/portfolio/portfolio-public.mapper.js';
import type { PrismaService } from '../src/prisma/prisma.service.js';
import { storyDraftFixture } from './portfolio-contract.fixtures.js';

describe('Atomic story save on dedicated PostgreSQL', () => {
  const owner = randomUUID(),
    serviceId = randomUUID();
  const mediaIds = Array.from({ length: 10 }, () => randomUUID());
  const items = mediaIds.map((mediaId) => ({
    id: randomUUID(),
    image: { mediaId, alt: { uk: 'Фото', en: 'Photo' }, focalPoint: null },
  }));
  const data = { ...storyDraftFixture, slug: 'atomic-' + owner, serviceId, cover: items[0].image };
  let prisma: PrismaClient;
  let persistence: PortfolioPersistenceService;
  let admin: PortfolioAdminService;
  let storyId: string;
  beforeAll(async () => {
    const raw = process.env.PORTFOLIO_TEST_DATABASE_URL;
    if (!raw)
      throw new Error(
        'PORTFOLIO_TEST_DATABASE_URL is required: a migrated dedicated local *_test database',
      );
    const url = new URL(raw);
    if (
      !['postgres:', 'postgresql:'].includes(url.protocol) ||
      !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
      !/^\/[a-z0-9_]+_test$/.test(url.pathname) ||
      (url.searchParams.has('schema') && url.searchParams.get('schema') !== 'public')
    )
      throw new Error('Only a dedicated local *_test database is allowed');
    prisma = new PrismaClient({ datasources: { db: { url: raw } } });
    persistence = new PortfolioPersistenceService(prisma as PrismaService);
    admin = new PortfolioAdminService(prisma as PrismaService, persistence, new ConfigService());
    await prisma.user.create({
      data: { id: owner, email: owner + '@atomic.invalid', passwordHash: 'synthetic' },
    });
    await prisma.portfolioService.create({
      data: {
        id: serviceId,
        slug: 'atomic-service-' + owner,
        status: 'PUBLISHED',
        publishedVersion: 1n,
        publishedAt: new Date(),
      },
    });
    for (const id of mediaIds)
      await prisma.portfolioMedia.create({
        data: {
          id,
          uploadedById: owner,
          filename: 'synthetic.jpg',
          mimeType: 'image/jpeg',
          sizeBytes: 16n,
          status: 'READY',
          variants: {
            create: { key: 'portfolio/media/' + id + '/test.webp', width: 480, height: 320 },
          },
        },
      });
    storyId = (await admin.createStoryWithPhotos(owner, data, items)).id;
  });
  afterAll(async () => {
    if (!prisma) return;
    try {
      if (storyId) {
        await prisma.portfolioPublishedDocument.deleteMany({
          where: { entityType: 'STORY', entityId: storyId },
        });
        await prisma.portfolioStory.deleteMany({ where: { id: storyId } });
      }
      await prisma.portfolioService.deleteMany({ where: { id: serviceId } });
      await prisma.portfolioMediaVariant.deleteMany({ where: { mediaId: { in: mediaIds } } });
      await prisma.portfolioMedia.deleteMany({ where: { id: { in: mediaIds } } });
      await prisma.user.deleteMany({ where: { id: owner } });
    } finally {
      await prisma.$disconnect();
    }
  });
  it('rolls back claimed version, metadata and deleted photos when createMany fails', async () => {
    const before = await admin.getStory(storyId);
    const faultyPersistence = Object.create(persistence) as PortfolioPersistenceService;
    faultyPersistence.withContentLock = (operation) =>
      persistence.withContentLock((tx) =>
        operation(
          new Proxy(tx, {
            get(target, key, receiver) {
              if (key === 'portfolioStoryPhoto')
                return new Proxy(target.portfolioStoryPhoto, {
                  get(model, method, modelReceiver) {
                    if (method === 'createMany')
                      return () => Promise.reject(new Error('synthetic createMany failure'));
                    return Reflect.get(model, method, modelReceiver);
                  },
                });
              return Reflect.get(target, key, receiver);
            },
          }),
        ),
      );
    const failing = new PortfolioAdminService(
      prisma as PrismaService,
      faultyPersistence,
      new ConfigService(),
    );
    await expect(
      failing.saveStoryDraft(
        owner,
        storyId,
        before.draftVersion,
        { ...data, title: { uk: 'Зміна', en: 'Change' } },
        [...items].reverse(),
      ),
    ).rejects.toThrow('synthetic createMany failure');
    expect(await admin.getStory(storyId)).toEqual(before);
  });
  it('saving an already published story does not change its public card', async () => {
    const before = await admin.getStory(storyId);
    const publication = new PortfolioPublicationService(prisma as PrismaService, persistence);
    await publication.publish(PortfolioEntityType.STORY, storyId, before.draftVersion);
    const readCard = () =>
      prisma.$transaction(async (tx) => {
        const row = await tx.portfolioStory.findUniqueOrThrow({
          where: { id: storyId },
          include: { publishedDocument: true },
        });
        return new PortfolioPublicMapper(tx, 'en').storyCard(row);
      });
    const card = await readCard();
    await admin.saveStoryDraft(
      owner,
      storyId,
      before.draftVersion,
      { ...data, title: { uk: 'Неопублікована', en: 'Unpublished' } },
      items,
    );
    expect(await readCard()).toEqual(card);
  });
});
