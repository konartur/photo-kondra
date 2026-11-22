import { afterAll, beforeAll, describe, expect, it, jest } from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { Redis } from 'ioredis';
import { setTimeout } from 'node:timers/promises';
import type { PrismaService } from '../src/prisma/prisma.service.js';
import { createQueueInfrastructureConfig } from '../src/queues/queue.config.js';
import { PortfolioPublicCache } from '../src/portfolio/portfolio-public-cache.js';
import { PortfolioCacheInvalidationService } from '../src/portfolio/portfolio-cache-invalidation.service.js';
import { PortfolioPublicReader } from '../src/portfolio/portfolio-public-reader.js';
import { PortfolioPublicationService } from '../src/portfolio/portfolio-publication.service.js';
import { PortfolioPersistenceService } from '../src/portfolio/persistence/portfolio-persistence.service.js';

const port = process.env.PORTFOLIO_TEST_REDIS_PORT;
const prefix = 'portfolio:public:v1:';
const suite = port ? describe : describe.skip;

suite('Portfolio public reader with isolated PostgreSQL and Redis', () => {
  let prisma: PrismaClient;
  let redis: Redis;
  let cache: PortfolioPublicCache;
  let reader: PortfolioPublicReader;
  let createCache: () => PortfolioPublicCache;
  let config: ConfigService;
  let queries = 0;
  let version: bigint | undefined;

  beforeAll(async () => {
    const url = new URL(process.env.PORTFOLIO_TEST_DATABASE_URL ?? '');
    if (
      !['postgres:', 'postgresql:'].includes(url.protocol) ||
      !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
      !/^\/[a-z0-9_]+_test$/.test(url.pathname) ||
      (url.searchParams.has('schema') && url.searchParams.get('schema') !== 'public')
    )
      throw new Error('Use a dedicated local *_test database');
    if (
      !/^\d+$/.test(port ?? '') ||
      Number(port) < 1024 ||
      Number(port) > 65535 ||
      Number(port) === 6379
    )
      throw new Error('Use a dedicated Redis instance on a local test port other than 6379');

    prisma = new PrismaClient({
      datasources: { db: { url: url.toString() } },
      log: [{ emit: 'event', level: 'query' }],
    });
    prisma.$on('query' as never, () => {
      queries++;
    });
    redis = new Redis({
      host: '127.0.0.1',
      port: Number(port),
      connectTimeout: 500,
      commandTimeout: 1500,
      retryStrategy: () => null,
    });
    if ((await redis.dbsize()) !== 0)
      throw new Error('Start with a dedicated empty Redis instance');
    config = new ConfigService({
      REDIS_HOST: '127.0.0.1',
      REDIS_PORT: port,
      JWT_ACCESS_SECRET: 'synthetic-test-cache-secret',
      PORTFOLIO_CACHE_TTL: '1',
      PORTFOLIO_CACHE_TIMEOUT_MS: '100',
    });
    const queue = createQueueInfrastructureConfig(config);
    createCache = () => new PortfolioPublicCache(config, queue);
    cache = createCache();
    const db = prisma as PrismaService;
    reader = new PortfolioPublicReader(
      db,
      config,
      {
        createDownloadUrl: async () => {
          throw new Error('Unexpected signing');
        },
      },
      cache,
    );
    for (let i = 0; i < 20; i++) {
      try {
        await cache.invalidate(0n);
        break;
      } catch (error) {
        if (i === 19) throw error;
        await setTimeout(25);
      }
    }
  });

  afterAll(async () => {
    cache?.onModuleDestroy();
    redis?.disconnect();
    if (version !== undefined)
      await prisma.portfolioCacheInvalidation.deleteMany({ where: { contentVersion: version } });
    await prisma?.$disconnect();
  });

  it('fills and expires a versioned bucket, verifies hits with one SELECT, and ignores corrupted entries', async () => {
    queries = 0;
    const start = performance.now();
    const cold = await reader.sitemap();
    const coldMs = performance.now() - start;
    const coldQueries = queries;
    queries = 0;
    const warmStart = performance.now();
    expect(await reader.sitemap()).toEqual(cold);
    const warmMs = performance.now() - warmStart;
    expect(queries).toBe(1);
    expect(coldQueries).toBeGreaterThan(queries);
    console.info({
      coldQueries,
      warmQueries: queries,
      coldMs,
      warmMs,
      responseBytes: Buffer.byteLength(JSON.stringify(cold)),
    });

    const bucket = prefix + String(cold.contentVersion).padStart(16, '0');
    expect(await redis.pttl(bucket)).toBeGreaterThan(0);
    const [field] = await redis.hkeys(bucket);
    await redis.hset(
      bucket,
      field,
      JSON.stringify({ schema: 1, data: { contentVersion: cold.contentVersion } }),
    );
    expect(await reader.sitemap()).toEqual(cold);
    await setTimeout(1100);
    expect(await redis.exists(bucket)).toBe(0);
  });

  it('fences a concurrent publication, falls back after timeout and replays the outbox after restart', async () => {
    const db = prisma as PrismaService;
    const previous = await reader.sitemap();
    const maintenance = new PortfolioCacheInvalidationService(db, cache);
    const persistence = new PortfolioPersistenceService(db);

    // Commit after Redis returns the old candidate but before the DB version check.
    const get = cache.get.bind(cache);
    const spy = jest.spyOn(cache, 'get').mockImplementationOnce(async (address) => {
      const candidate = await get(address);
      version = await persistence.withContentLock((tx) => persistence.advanceContentVersion(tx));
      return candidate;
    });
    await redis.set('bull:portfolio-test:sentinel', 'unchanged');
    try {
      expect((await reader.sitemap()).contentVersion).toBe(previous.contentVersion + 1);
    } finally {
      spy.mockRestore();
    }

    await redis.call('CLIENT', 'PAUSE', '350', 'ALL');
    await maintenance.sweep();
    const failed = await prisma.portfolioCacheInvalidation.findUniqueOrThrow({
      where: { contentVersion: version },
    });
    expect(failed.attempts).toBeGreaterThan(0);
    expect(failed.processedAt).toBeNull();
    expect((await reader.sitemap()).contentVersion).toBe(Number(version));
    await setTimeout(400);

    const restarted = createCache();
    const replay = new PortfolioCacheInvalidationService(db, restarted);
    try {
      replay.onModuleInit();
      for (let i = 0; i < 35; i++) {
        const row = await prisma.portfolioCacheInvalidation.findUniqueOrThrow({
          where: { id: failed.id },
        });
        if (row.processedAt) break;
        await setTimeout(200);
      }
      await replay.sweep();
      await replay.sweep();
      expect(
        (await prisma.portfolioCacheInvalidation.findUniqueOrThrow({ where: { id: failed.id } }))
          .processedAt,
      ).not.toBeNull();
      await restarted.put(['sitemap'], previous);
      expect(await restarted.get(['sitemap'])).not.toEqual(previous);
      expect(await redis.get('bull:portfolio-test:sentinel')).toBe('unchanged');
    } finally {
      await replay.onModuleDestroy();
      restarted.onModuleDestroy();
      await redis.del('bull:portfolio-test:sentinel');
    }
  }, 15000);

  it('returns 503 when the database fence is unavailable even with a cached response', async () => {
    const response = await reader.sitemap();
    expect(await cache.get(['sitemap'])).toEqual(response);
    const configError = new Error('Synthetic PostgreSQL outage');
    const unavailableDb = {
      portfolioContentState: {
        findUniqueOrThrow: async () => {
          throw configError;
        },
      },
    } as unknown as PrismaService;
    const unavailableReader = new PortfolioPublicReader(
      unavailableDb,
      config,
      {
        createDownloadUrl: async () => {
          throw new Error('Unexpected signing');
        },
      },
      cache,
    );
    await expect(unavailableReader.sitemap()).rejects.toMatchObject({ status: 503 });
  });

  it('commits publication during a Redis timeout and drops orphaned cache versions after archive', async () => {
    const id = randomUUID();
    const mediaId = randomUUID();
    const ownerId = randomUUID();
    const versions: bigint[] = [];
    const db = prisma as PrismaService;
    const invalidation = new PortfolioCacheInvalidationService(db, cache);
    const publication = new PortfolioPublicationService(
      db,
      new PortfolioPersistenceService(db),
      invalidation,
    );
    const address = ['services', 'en', 50, null] as const;
    const query = { locale: 'en', limit: 50 } as const;
    try {
      await prisma.user.create({
        data: { id: ownerId, email: ownerId + '@cache.invalid', passwordHash: 'synthetic' },
      });
      await prisma.portfolioMedia.create({
        data: {
          id: mediaId,
          uploadedById: ownerId,
          filename: 'synthetic.jpg',
          mimeType: 'image/jpeg',
          sizeBytes: 100n,
          status: 'READY',
          variants: {
            create: {
              key: 'portfolio/media/' + mediaId + '/variants/' + id + '/480.webp',
              width: 480,
              height: 320,
            },
          },
        },
      });
      await prisma.portfolioService.create({
        data: {
          id,
          slug: id,
          cardMediaId: mediaId,
          cardAltUk: 'Кадр',
          cardAltEn: 'Frame',
          titleUk: 'Портрет',
          titleEn: 'Portrait',
          descriptionUk: 'Опис',
          descriptionEn: 'Description',
          seoTitleUk: 'Портрет',
          seoTitleEn: 'Portrait',
          seoDescriptionUk: 'Опис',
          seoDescriptionEn: 'Description',
        },
      });
      const before = await reader.services(query);
      expect((await cache.get(address))?.contentVersion).toBe(before.contentVersion);
      await redis.call('CLIENT', 'PAUSE', '500', 'ALL');
      const result = await publication.publish('SERVICE', id, 1);
      versions.push(BigInt(result.contentVersion));
      expect(result.status).toBe('PUBLISHED');
      expect((await reader.services(query)).items).toEqual(
        expect.arrayContaining([expect.objectContaining({ id })]),
      );
      await setTimeout(550);
      const published = await reader.services(query);
      expect((await cache.get(address))?.contentVersion).toBe(published.contentVersion);
      const archived = await publication.archive('SERVICE', id, 1);
      versions.push(BigInt(archived.contentVersion));
      expect((await reader.services(query)).items.find((item) => item.id === id)).toBeUndefined();
      await invalidation.sweep();
      await cache.put(address, published);
      expect((await cache.get(address))?.contentVersion).not.toBe(published.contentVersion);
    } finally {
      await invalidation.onModuleDestroy();
      await prisma.portfolioPublishedDocument.deleteMany({
        where: { entityType: 'SERVICE', entityId: id },
      });
      await prisma.portfolioService.deleteMany({ where: { id } });
      await prisma.portfolioMediaVariant.deleteMany({ where: { mediaId } });
      await prisma.portfolioMedia.deleteMany({ where: { id: mediaId } });
      await prisma.user.deleteMany({ where: { id: ownerId } });
      await prisma.portfolioCacheInvalidation.deleteMany({
        where: { contentVersion: { in: versions } },
      });
    }
  }, 15000);
});
