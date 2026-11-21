import { ConflictException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { PortfolioEntityType, Prisma } from '@prisma/client';
import { isDeepStrictEqual } from 'node:util';
import { setTimeout } from 'node:timers/promises';
import { PrismaService } from '../../prisma/prisma.service.js';
import { parsePortfolioSnapshot, snapshotJson, snapshotReferences } from './portfolio-snapshot.js';

export const PORTFOLIO_SETTINGS_ID = '00000000-0000-4000-8000-000000000001';
export const PORTFOLIO_CONTENT_STATE_ID = 1;

function versionConflict(): ConflictException {
  return new ConflictException({
    code: 'PORTFOLIO_VERSION_CONFLICT',
    message: 'Portfolio content version changed',
  });
}

function databaseVersion(value: number): bigint {
  if (!Number.isSafeInteger(value) || value < 1) throw versionConflict();
  return BigInt(value);
}

/** Internal persistence primitives; callers authorize ADMIN and validate domain rules.
 * All draft/reference changes, publish/archive and delete must use withContentLock.
 * Retry callbacks must perform database operations only, without storage/network effects.
 */
@Injectable()
export class PortfolioPersistenceService {
  constructor(private readonly prisma: PrismaService) {}

  async withContentLock<T>(operation: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        return await this.prisma.$transaction(
          async (tx) => {
            // Seeded by the additive migration; do not silently recreate a missing fence.
            const state = await tx.$queryRaw<{ id: number }[]>`
            SELECT "id" FROM "PortfolioContentState" WHERE "id" = 1 FOR UPDATE
          `;
            if (state.length !== 1)
              throw new ServiceUnavailableException('Portfolio state is unavailable');
            return operation(tx);
          },
          {
            isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
            maxWait: 5000,
            timeout: 10000,
          },
        );
      } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError) ||
          !(error.code === 'P2034' || (error.code === 'P2010' && error.meta?.code === '40001')))
          throw error;
        if (attempt < 4) await setTimeout(25 * (attempt + 1));
      }
    }
    throw new ServiceUnavailableException('Portfolio is busy; please retry');
  }

  /** Claim before changing related rows. Conflict rolls back the entire transaction. */
  async claimDraftVersion(
    tx: Prisma.TransactionClient,
    entityType: PortfolioEntityType,
    id: string,
    expectedVersion: number,
  ): Promise<bigint> {
    const draftVersion = databaseVersion(expectedVersion);
    const args = { where: { id, draftVersion }, data: { draftVersion: { increment: 1n } } };
    const result =
      entityType === 'SERVICE'
        ? await tx.portfolioService.updateMany(args)
        : entityType === 'STORY'
          ? await tx.portfolioStory.updateMany(args)
          : await tx.portfolioSettings.updateMany(args);
    if (result.count !== 1) throw versionConflict();
    return draftVersion + 1n;
  }

  /** Invoke once for an actual public change, after idempotency/domain checks.
   * Snapshot/state/outbox commit or roll back together within withContentLock.
   */
  async advanceContentVersion(tx: Prisma.TransactionClient): Promise<bigint> {
    const state = await tx.portfolioContentState.update({
      where: { id: PORTFOLIO_CONTENT_STATE_ID },
      data: { contentVersion: { increment: 1n } },
    });
    await tx.portfolioCacheInvalidation.create({ data: { contentVersion: state.contentVersion } });
    return state.contentVersion;
  }

  /** Stores the frozen editorial payload and all JSON references in one transaction.
   * The publication service still checks readiness/dependencies and updates lifecycle.
   */
  async writeSnapshot(
    tx: Prisma.TransactionClient,
    entityId: string,
    sourceDraftVersion: number,
    value: unknown,
  ) {
    const snapshot = await parsePortfolioSnapshot(value);
    const version = databaseVersion(sourceDraftVersion);
    const entity =
      snapshot.entityType === 'SERVICE'
        ? await tx.portfolioService.findUnique({
            where: { id: entityId },
            select: { draftVersion: true },
          })
        : snapshot.entityType === 'STORY'
          ? await tx.portfolioStory.findUnique({
              where: { id: entityId },
              select: { draftVersion: true },
            })
          : await tx.portfolioSettings.findUnique({
              where: { id: entityId },
              select: { draftVersion: true },
            });
    if (!entity || entity.draftVersion !== version) throw versionConflict();
    const json = snapshotJson(snapshot);
    const { entityType, schemaVersion } = snapshot;
    const existing = await tx.portfolioPublishedDocument.findUnique({
      where: { entityType_entityId: { entityType, entityId } },
    });
    if (existing && version <= existing.sourceDraftVersion) {
      if (version === existing.sourceDraftVersion && isDeepStrictEqual(existing.snapshot, json))
        return existing;
      throw versionConflict();
    }
    const owner = {
      serviceId: entityType === 'SERVICE' ? entityId : null,
      storyId: entityType === 'STORY' ? entityId : null,
      settingsId: entityType === 'SETTINGS' ? entityId : null,
    };
    const document = await tx.portfolioPublishedDocument.upsert({
      where: { entityType_entityId: { entityType, entityId } },
      create: {
        entityType,
        entityId,
        ...owner,
        schemaVersion,
        sourceDraftVersion: version,
        snapshot: json,
      },
      update: {
        schemaVersion,
        sourceDraftVersion: version,
        snapshot: json,
        publishedAt: new Date(),
      },
    });
    const refs = snapshotReferences(snapshot);
    await tx.portfolioPublishedMediaReference.deleteMany({ where: { documentId: document.id } });
    await tx.portfolioPublishedServiceReference.deleteMany({ where: { documentId: document.id } });
    await tx.portfolioPublishedStoryReference.deleteMany({ where: { documentId: document.id } });
    if (refs.mediaIds.length)
      await tx.portfolioPublishedMediaReference.createMany({
        data: refs.mediaIds.map((mediaId) => ({ documentId: document.id, mediaId })),
      });
    if (refs.serviceIds.length)
      await tx.portfolioPublishedServiceReference.createMany({
        data: refs.serviceIds.map((serviceId) => ({ documentId: document.id, serviceId })),
      });
    if (refs.storyIds.length)
      await tx.portfolioPublishedStoryReference.createMany({
        data: refs.storyIds.map((storyId) => ({ documentId: document.id, storyId })),
      });
    return document;
  }
}
