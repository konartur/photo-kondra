import { ConflictException } from '@nestjs/common';
import { describe, expect, it, jest } from '@jest/globals';
import { PortfolioEntityType, Prisma } from '@prisma/client';
import { PortfolioPublicationService } from './portfolio-publication.service.js';
import type { PortfolioPersistenceService } from './persistence/portfolio-persistence.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';

describe('PortfolioPublicationService', () => {
  const resolved = <T>(value: T) => jest.fn<() => Promise<T>>().mockResolvedValue(value);
  const transaction = (models: Record<string, unknown>) => models as unknown as Prisma.TransactionClient;
  it('does not create a new revision or invalidate cache for an idempotent publish', async () => {
    const tx = transaction({
      portfolioService: { findUnique: resolved({
        id: 'service-id', status: 'PUBLISHED', draftVersion: 3n, publishedVersion: 3n,
        publishedAt: new Date('2026-11-21T12:00:00.000Z'),
      }) },
      portfolioContentState: { findUniqueOrThrow: resolved({ contentVersion: 9n }) },
      portfolioPublishedDocument: { findUnique: resolved({ id: 'document-id' }) },
    });
    const persistence = {
      withContentLock: jest.fn((operation: (client: Prisma.TransactionClient) => unknown) => operation(tx)),
      writeSnapshot: jest.fn(),
      advanceContentVersion: jest.fn(),
    } as unknown as PortfolioPersistenceService;
    const service = new PortfolioPublicationService({} as PrismaService, persistence);

    await expect(service.publish(PortfolioEntityType.SERVICE, 'service-id', 3)).resolves.toEqual({
      id: 'service-id', status: 'PUBLISHED', draftVersion: 3, publishedVersion: 3,
      contentVersion: 9, publishedAt: '2026-11-21T12:00:00.000Z',
    });
    expect(persistence.writeSnapshot).not.toHaveBeenCalled();
    expect(persistence.advanceContentVersion).not.toHaveBeenCalled();
  });

  it('rejects stale versions before changing publication state', async () => {
    const tx = transaction({
      portfolioStory: { findUnique: resolved({ id: 'story-id', status: 'DRAFT', draftVersion: 4n, publishedVersion: null, publishedAt: null }) },
    });
    const persistence = {
      withContentLock: jest.fn((operation: (client: Prisma.TransactionClient) => unknown) => operation(tx)),
      writeSnapshot: jest.fn(),
      advanceContentVersion: jest.fn(),
    } as unknown as PortfolioPersistenceService;
    const service = new PortfolioPublicationService({} as PrismaService, persistence);

    await expect(service.publish(PortfolioEntityType.STORY, 'story-id', 3)).rejects.toBeInstanceOf(ConflictException);
    expect(persistence.writeSnapshot).not.toHaveBeenCalled();
    expect(persistence.advanceContentVersion).not.toHaveBeenCalled();
  });
});
