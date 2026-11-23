import { describe, expect, it, jest } from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import { ConflictException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { StorageService } from '../../storage/storage.service.js';
import { PortfolioPersistenceService } from '../persistence/portfolio-persistence.service.js';
import { PortfolioMediaService } from './portfolio-media.service.js';
import { PortfolioMediaJobs } from './portfolio-media.jobs.js';
import { PortfolioMediaCleanupService } from './portfolio-media-cleanup.service.js';

const id = '12345678-1234-4234-8234-123456789012';
function fixture(status: 'UPLOADING' | 'PROCESSING' | 'READY' | 'FAILED' = 'UPLOADING') {
  const row = {
    id,
    uploadedById: id,
    originalKey: `portfolio/media/${id}/original.jpg`,
    filename: 'fixture.jpg',
    mimeType: 'image/jpeg',
    sizeBytes: 100n,
    width: null,
    height: null,
    status,
    processingLockId: null,
    processingLockExpiresAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    variants: [],
  };
  const tx = {
    portfolioMedia: {
      findFirst: jest.fn<() => Promise<typeof row | null>>().mockResolvedValue(row),
      create: jest.fn<() => Promise<typeof row>>().mockResolvedValue(row),
      update: jest.fn<() => Promise<typeof row>>().mockImplementation(async () => {
        row.status = 'PROCESSING';
        return row;
      }),
      count: jest.fn<() => Promise<number>>().mockResolvedValue(0),
    },
  };
  const persistence = {
    withContentLock: <T>(operation: (tx: Prisma.TransactionClient) => Promise<T>) =>
      operation(tx as unknown as Prisma.TransactionClient),
  } as PortfolioPersistenceService;
  const storage = {
    createUploadUrl: jest
      .fn<StorageService['createUploadUrl']>()
      .mockResolvedValue('https://storage.example.invalid/put'),
    exists: jest.fn<StorageService['exists']>().mockResolvedValue(true),
  } as unknown as StorageService;
  const jobs = { ensureQueued: jest.fn<PortfolioMediaJobs['ensureQueued']>().mockResolvedValue() };
  const cleanup = { clean: jest.fn<PortfolioMediaCleanupService['clean']>().mockResolvedValue() };
  const service = new PortfolioMediaService(
    tx as unknown as PrismaService,
    persistence,
    storage,
    jobs as unknown as PortfolioMediaJobs,
    cleanup as unknown as PortfolioMediaCleanupService,
    new ConfigService({ SIGNED_URL_UPLOAD_TTL: '900' }),
  );
  return { service, tx, storage, jobs, cleanup, row };
}

describe('Portfolio media orchestration', () => {
  it('signs the exact bounded upload size and creates an independent portfolio row', async () => {
    const test = fixture();
    const result = await test.service.requestUpload(id, {
      filename: 'fixture.jpg',
      mimeType: 'image/jpeg',
      sizeBytes: 20_000_000,
    });
    expect(test.storage.createUploadUrl).toHaveBeenCalledWith(
      expect.objectContaining({
        contentLength: 20_000_000,
        key: expect.stringMatching(/^portfolio\/media\//),
      }),
    );
    expect(result.requiredHeaders).toEqual({ 'Content-Type': 'image/jpeg', 'If-None-Match': '*' });
    await expect(
      test.service.requestUpload(id, {
        filename: 'fixture.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: 20_000_001,
      }),
    ).rejects.toThrow();
  });
  it('leaves a recoverable PROCESSING row if queue publication fails', async () => {
    const test = fixture();
    test.jobs.ensureQueued.mockRejectedValueOnce(new Error('synthetic outage'));
    await expect(test.service.complete(id, id)).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(test.row.status).toBe('PROCESSING');
    await expect(test.service.complete(id, id)).resolves.toMatchObject({ status: 'PROCESSING' });
  });
  it('does not re-enqueue or mutate READY media on repeated completion', async () => {
    const test = fixture('READY');
    await test.service.complete(id, id);
    expect(test.jobs.ensureQueued).not.toHaveBeenCalled();
    expect(test.tx.portfolioMedia.update).not.toHaveBeenCalled();
  });
  it('rejects access when ownership lookup fails and blocks referenced deletion before storage I/O', async () => {
    const test = fixture('READY');
    test.tx.portfolioMedia.findFirst.mockResolvedValueOnce(null);
    await expect(test.service.complete('foreign-owner', id)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    test.tx.portfolioMedia.count.mockResolvedValue(1);
    await expect(test.service.remove(id, id)).rejects.toBeInstanceOf(ConflictException);
    expect(test.cleanup.clean).not.toHaveBeenCalled();
  });
});
