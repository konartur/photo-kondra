import { describe, expect, it, jest } from '@jest/globals';
import type { Prisma } from '@prisma/client';
import type { StorageService } from '../../storage/storage.service.js';
import { PortfolioPersistenceService } from '../persistence/portfolio-persistence.service.js';
import { PortfolioMediaCleanupService } from './portfolio-media-cleanup.service.js';

const id = '12345678-1234-4234-8234-123456789012';
function fixture(
  status: 'FAILED' | 'DELETED',
  key = `portfolio/media/${id}/variants/attempt/480.webp`,
) {
  const timeline: string[] = [];
  const tx = {
    portfolioMedia: {
      findFirst: jest
        .fn()
        .mockImplementation(async () => ({
          status,
          originalKey: `portfolio/media/${id}/original.jpg`,
          variants: [{ key }],
        })),
    },
  };
  const persistence = {
    withContentLock: async <T>(operation: (tx: Prisma.TransactionClient) => Promise<T>) => {
      timeline.push('lock');
      const result = await operation(tx as unknown as Prisma.TransactionClient);
      timeline.push('commit');
      return result;
    },
  } as PortfolioPersistenceService;
  const storage = {
    delete: jest.fn<StorageService['delete']>().mockImplementation(async (key) => {
      timeline.push(key);
    }),
  };
  return {
    service: new PortfolioMediaCleanupService(persistence, storage as unknown as StorageService),
    storage,
    timeline,
  };
}
describe('Portfolio cleanup journal safety', () => {
  it('captures the journal under the fence but performs S3 deletion after commit', async () => {
    const test = fixture('DELETED');
    await test.service.clean(id);
    expect(test.timeline.slice(0, 2)).toEqual(['lock', 'commit']);
    expect(test.storage.delete).toHaveBeenCalledTimes(2);
  });
  it('retains an original on processing failure so transient retries can reuse it', async () => {
    const test = fixture('FAILED');
    await test.service.clean(id);
    expect(test.storage.delete).toHaveBeenCalledTimes(1);
    expect(test.storage.delete).not.toHaveBeenCalledWith(
      expect.stringContaining('original.jpg'),
      expect.anything(),
    );
  });
  it('never cleans keys outside the media namespace even if a journal row is corrupt', async () => {
    const test = fixture('DELETED', 'galleries/foreign/originals/photo.jpg');
    await expect(test.service.clean(id)).rejects.toThrow('Invalid portfolio object namespace');
    expect(test.storage.delete).not.toHaveBeenCalled();
  });
});
