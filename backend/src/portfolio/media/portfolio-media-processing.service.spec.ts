import { describe, expect, it, jest } from '@jest/globals';
import type { PortfolioMedia, PortfolioMediaVariant, Prisma } from '@prisma/client';
import { fileURLToPath } from 'node:url';
import type { StorageService } from '../../storage/storage.service.js';
import { PortfolioPersistenceService } from '../persistence/portfolio-persistence.service.js';
import { PortfolioImageProcessor } from './portfolio-image-processor.js';
import { PortfolioMediaProcessingService } from './portfolio-media-processing.service.js';
import {
  PortfolioMediaClaimLostError,
  PortfolioMediaLeaseBusyError,
} from './portfolio-media.config.js';

const id = '12345678-1234-4234-8234-123456789012';
function fixture() {
  const row: PortfolioMedia = {
    id,
    uploadedById: id,
    originalKey: `portfolio/media/${id}/original.jpg`,
    filename: 'synthetic.jpg',
    mimeType: 'image/jpeg',
    sizeBytes: 100n,
    width: null,
    height: null,
    status: 'PROCESSING',
    processingLockId: null,
    processingLockExpiresAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  let variants: PortfolioMediaVariant[] = [];
  let rejectReadyCommit = false;
  const tx = {
    portfolioMedia: {
      findUnique: jest.fn().mockImplementation(async () => ({ ...row, variants: [...variants] })),
      count: jest
        .fn()
        .mockImplementation(async () =>
          row.status === 'PROCESSING' && row.processingLockId ? 1 : 0,
        ),
      update: jest
        .fn<(args: Prisma.PortfolioMediaUpdateArgs) => Promise<PortfolioMedia>>()
        .mockImplementation(async (args) => {
          Object.assign(row, args.data);
          if (args.data.status === 'READY' && rejectReadyCommit)
            throw new Error('synthetic ambiguous commit');
          return row;
        }),
      updateMany: jest
        .fn<(args: Prisma.PortfolioMediaUpdateManyArgs) => Promise<{ count: number }>>()
        .mockImplementation(async (args) => {
          if (row.status !== 'PROCESSING' || row.processingLockId !== args.where?.processingLockId)
            return { count: 0 };
          Object.assign(row, args.data);
          return { count: 1 };
        }),
    },
    portfolioMediaVariant: {
      deleteMany: jest.fn().mockImplementation(async () => {
        variants = [];
      }),
      createMany: jest
        .fn<(args: Prisma.PortfolioMediaVariantCreateManyArgs) => Promise<{ count: number }>>()
        .mockImplementation(async (args) => {
          const data = Array.isArray(args.data) ? args.data : [args.data];
          variants = data.map((value) => ({
            id: value.id!,
            mediaId: value.mediaId,
            key: value.key,
            width: value.width,
            height: value.height,
            format: value.format ?? 'webp',
            createdAt: new Date(),
          }));
          return { count: variants.length };
        }),
    },
  };
  const persistence = {
    withContentLock: <T>(operation: (tx: Prisma.TransactionClient) => Promise<T>) =>
      operation(tx as unknown as Prisma.TransactionClient),
  } as PortfolioPersistenceService;
  const prepared = {
    width: 480,
    height: 320,
    variants: [
      {
        width: 480,
        height: 320,
        path: fileURLToPath(new URL('../../../package.json', import.meta.url)),
      },
    ],
    cleanup: jest.fn<() => Promise<void>>().mockResolvedValue(),
  };
  const processor = {
    prepare: jest.fn<PortfolioImageProcessor['prepare']>().mockResolvedValue(prepared),
  };
  const upload = jest.fn<StorageService['upload']>().mockImplementation(async ({ body }) => {
    for await (const chunk of body) void chunk;
  });
  const storage = { upload, delete: jest.fn<StorageService['delete']>().mockResolvedValue() };
  const service = new PortfolioMediaProcessingService(
    persistence,
    processor as unknown as PortfolioImageProcessor,
    storage as unknown as StorageService,
    {
      maxPixels: 40_000_000,
      quality: 82,
      lockTtlSeconds: 900,
      processingTimeoutSeconds: 120,
      maintenanceIntervalSeconds: 30,
    },
  );
  return {
    row,
    tx,
    processor,
    storage,
    prepared,
    service,
    rejectCommit: () => {
      rejectReadyCommit = true;
    },
  };
}
describe('Portfolio processing lease and publication safety', () => {
  it('skips READY retries and defers a second worker while a live lease exists', async () => {
    const test = fixture();
    test.row.status = 'READY';
    await test.service.process({ mediaId: id });
    expect(test.processor.prepare).not.toHaveBeenCalled();
    test.row.status = 'PROCESSING';
    test.row.processingLockExpiresAt = new Date(Date.now() + 60_000);
    await expect(test.service.process({ mediaId: id })).rejects.toBeInstanceOf(
      PortfolioMediaLeaseBusyError,
    );
  });
  it('records attempt keys before upload and marks READY only after transfer completion', async () => {
    const test = fixture();
    test.storage.upload.mockImplementationOnce(async ({ body }) => {
      expect(test.tx.portfolioMediaVariant.createMany).toHaveBeenCalledTimes(1);
      expect(test.row.status).toBe('PROCESSING');
      for await (const chunk of body) void chunk;
    });
    await test.service.process({ mediaId: id });
    expect(test.row.status).toBe('READY');
    expect(test.prepared.cleanup).toHaveBeenCalledTimes(1);
  });
  it('cannot resurrect a deleted media record or upload derivatives after losing its claim', async () => {
    const test = fixture();
    test.processor.prepare.mockImplementationOnce(async () => {
      test.row.status = 'DELETED';
      test.row.processingLockId = null;
      return test.prepared;
    });
    await expect(test.service.process({ mediaId: id })).rejects.toBeInstanceOf(
      PortfolioMediaClaimLostError,
    );
    expect(test.row.status).toBe('DELETED');
    expect(test.storage.upload).not.toHaveBeenCalled();
  });
  it('does not delete valid derivative objects after an ambiguous successful READY commit', async () => {
    const test = fixture();
    test.rejectCommit();
    await expect(test.service.process({ mediaId: id })).rejects.toThrow(
      'synthetic ambiguous commit',
    );
    expect(test.row.status).toBe('READY');
    expect(test.storage.delete).not.toHaveBeenCalled();
  });
});
