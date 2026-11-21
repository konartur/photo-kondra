import { describe, expect, it, jest } from '@jest/globals';
import { ServiceUnavailableException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { PortfolioPersistenceService } from './portfolio-persistence.service.js';

function persistenceFixture() {
  const lockQuery = jest.fn<() => Promise<{ id: number }[]>>().mockResolvedValue([{ id: 1 }]);
  const tx = { $queryRaw: lockQuery } as unknown as Prisma.TransactionClient;
  const transaction = jest
    .fn<
      (
        operation: (client: Prisma.TransactionClient) => Promise<unknown>,
        options: object,
      ) => Promise<unknown>
    >()
    .mockImplementation((operation) => operation(tx));
  const prisma = { $transaction: transaction } as unknown as PrismaService;
  return { service: new PortfolioPersistenceService(prisma), transaction, lockQuery, tx };
}

describe('Portfolio write serialization', () => {
  it('takes the singleton fence before invoking a database-only callback', async () => {
    const { service, lockQuery, transaction, tx } = persistenceFixture();
    const operation = jest.fn(async (client: Prisma.TransactionClient) => {
      expect(lockQuery).toHaveBeenCalledTimes(1);
      expect(client).toBe(tx);
      return 'committed';
    });
    await expect(service.withContentLock(operation)).resolves.toBe('committed');
    expect(transaction).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({ isolationLevel: 'Serializable' }),
    );
  });

  it('fails closed if the migration-seeded fence is missing', async () => {
    const { service, lockQuery } = persistenceFixture();
    lockQuery.mockResolvedValue([]);
    const operation = jest.fn<() => Promise<void>>();
    await expect(service.withContentLock(operation)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(operation).not.toHaveBeenCalled();
  });

  it('retries serialization conflicts but does not replay arbitrary domain errors', async () => {
    const { service, transaction } = persistenceFixture();
    transaction.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('synthetic conflict', {
        code: 'P2034',
        clientVersion: '6.19.3',
      }),
    );
    await expect(service.withContentLock(async () => 42)).resolves.toBe(42);
    expect(transaction).toHaveBeenCalledTimes(2);
    const failure = new Error('synthetic domain failure');
    transaction.mockClear();
    await expect(
      service.withContentLock(async () => {
        throw failure;
      }),
    ).rejects.toBe(failure);
    expect(transaction).toHaveBeenCalledTimes(1);
  });
});
