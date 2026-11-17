import { describe, expect, it, jest } from '@jest/globals';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { StorageService } from '../storage/storage.service.js';
import { SelectedArchiveCleanupService } from './selected-archive-cleanup.service.js';

describe('SelectedArchiveCleanupService', () => {
  it('deletes expired selection objects before their records and leaves failures retryable', async () => {
    const findMany = jest
      .fn<PrismaService['archive']['findMany']>()
      .mockResolvedValue([{ id: 'expired', storageKey: 'private.zip' }] as Awaited<
        ReturnType<PrismaService['archive']['findMany']>
      >);
    const deleteMany = jest.fn();
    const remove = jest
      .fn<StorageService['delete']>()
      .mockRejectedValueOnce(new Error('Unavailable'))
      .mockResolvedValue();
    const service = new SelectedArchiveCleanupService(
      { archive: { findMany, deleteMany } } as unknown as PrismaService,
      { delete: remove } as unknown as StorageService,
    );
    await service.cleanup();
    expect(deleteMany).not.toHaveBeenCalled();
    await service.cleanup();
    expect(remove).toHaveBeenCalledWith('private.zip');
    expect(deleteMany).toHaveBeenCalledTimes(1);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          selectedPhotoIds: { isEmpty: false },
          expiresAt: { lte: expect.any(Date) },
        }),
      }),
    );
  });
});
