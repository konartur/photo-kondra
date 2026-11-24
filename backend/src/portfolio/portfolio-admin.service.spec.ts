import { describe, expect, it, jest } from '@jest/globals';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PortfolioAdminService } from './portfolio-admin.service.js';
import type { PortfolioPersistenceService } from './persistence/portfolio-persistence.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { storyDraftFixture } from '../../test/portfolio-contract.fixtures.js';

const photos = (count: number) =>
  Array.from({ length: count }, () => ({
    id: randomUUID(),
    image: { mediaId: randomUUID(), alt: { uk: '', en: '' }, focalPoint: null },
  }));
function harness(items = photos(10)) {
  const data = { ...storyDraftFixture, cover: items[0]?.image ?? null };
  const update = jest.fn<() => Promise<unknown>>().mockResolvedValue({});
  const createMany = jest
    .fn<(args: unknown) => Promise<unknown>>()
    .mockResolvedValue({ count: items.length });
  const row = {
    id: 'story',
    slug: data.slug,
    serviceId: data.serviceId,
    status: 'PUBLISHED',
    draftVersion: 4n,
    publishedVersion: 3n,
    publishedAt: new Date(),
    updatedAt: new Date(),
    titleUk: '',
    titleEn: '',
    subtitleUk: '',
    subtitleEn: '',
    descriptionUk: '',
    descriptionEn: '',
    coverMediaId: null,
    shareMediaId: null,
    photos: [],
  };
  const occupied = jest.fn<() => Promise<unknown>>().mockResolvedValue(null);
  const tx = {
    portfolioStory: {
      findUnique: jest.fn<() => Promise<unknown>>().mockResolvedValue(row),
      update,
      findUniqueOrThrow: jest.fn<() => Promise<unknown>>().mockResolvedValue(row),
    },
    portfolioService: {
      findUnique: jest.fn<() => Promise<unknown>>().mockResolvedValue({ id: data.serviceId }),
    },
    portfolioMedia: {
      findMany: jest
        .fn<() => Promise<unknown>>()
        .mockResolvedValue(items.map((item) => ({ id: item.image.mediaId }))),
    },
    portfolioStoryPhoto: {
      findFirst: occupied,
      deleteMany: jest.fn<() => Promise<unknown>>().mockResolvedValue({ count: 0 }),
      createMany,
    },
  } as unknown as Prisma.TransactionClient;
  const claim = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
  const withContentLock = jest.fn((operation: (client: Prisma.TransactionClient) => unknown) =>
    operation(tx),
  );
  const persistence = {
    withContentLock,
    claimDraftVersion: claim,
  } as unknown as PortfolioPersistenceService;
  return {
    service: new PortfolioAdminService({} as PrismaService, persistence, new ConfigService()),
    data,
    items,
    update,
    createMany,
    occupied,
    claim,
    withContentLock,
  };
}

describe('Atomic story draft save', () => {
  it('allows 10 photos with their cover included and blank alt in a draft', async () => {
    const h = harness();
    await expect(
      h.service.saveStoryDraft('owner', 'story', 3, h.data, h.items),
    ).resolves.toMatchObject({ status: 'PUBLISHED', publishedVersion: 3 });
    expect(h.claim).toHaveBeenCalledTimes(1);
    expect(h.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([expect.objectContaining({ sortOrder: 9 })]),
    });
  });
  it('rejects 11 unique media before entering the serializable transaction', async () => {
    const h = harness(photos(11));
    await expect(
      h.service.saveStoryDraft('owner', 'story', 3, h.data, h.items),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(h.withContentLock).not.toHaveBeenCalled();
  });
  it('rejects a placement owned by another story before replacing photos', async () => {
    const h = harness();
    h.occupied.mockResolvedValue({ id: h.items[0].id });
    await expect(
      h.service.saveStoryDraft('owner', 'story', 3, h.data, h.items),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(h.update).not.toHaveBeenCalled();
    expect(h.createMany).not.toHaveBeenCalled();
  });
  it('rejects a stale expectedVersion before writing metadata or photos', async () => {
    const h = harness();
    h.claim.mockRejectedValue(new ConflictException());
    await expect(
      h.service.saveStoryDraft('owner', 'story', 2, h.data, h.items),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(h.update).not.toHaveBeenCalled();
    expect(h.createMany).not.toHaveBeenCalled();
  });
  it('propagates createMany failure to the transaction owner', async () => {
    const h = harness();
    const error = new Error('synthetic createMany failure');
    h.createMany.mockRejectedValue(error);
    await expect(h.service.saveStoryDraft('owner', 'story', 3, h.data, h.items)).rejects.toBe(
      error,
    );
  });
});
