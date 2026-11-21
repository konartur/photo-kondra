import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { ConflictException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { PortfolioPersistenceService } from '../src/portfolio/persistence/portfolio-persistence.service.js';
import { serviceDraftFixture } from './portfolio-contract.fixtures.js';
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
