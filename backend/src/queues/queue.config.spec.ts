import { ConfigService } from '@nestjs/config';
import { describe, expect, it } from '@jest/globals';
import { createQueueInfrastructureConfig } from './queue.config.js';

describe('createQueueInfrastructureConfig', () => {
  it('builds Redis connection, retry, backoff and cleanup options from environment values', () => {
    const values: Record<string, string> = {
      REDIS_HOST: 'redis.internal',
      REDIS_PORT: '6380',
      REDIS_PASSWORD: 'secret',
      QUEUE_DEFAULT_ATTEMPTS: '5',
      QUEUE_BACKOFF_DELAY: '2000',
      QUEUE_REMOVE_ON_COMPLETE_AGE: '3600',
      QUEUE_REMOVE_ON_COMPLETE_COUNT: '100',
      QUEUE_REMOVE_ON_FAIL_AGE: '86400',
      QUEUE_REMOVE_ON_FAIL_COUNT: '500',
    };
    const configService = {
      get: (key: string) => values[key],
      getOrThrow: (key: string) => values[key],
    } as unknown as ConfigService;

    expect(createQueueInfrastructureConfig(configService)).toEqual({
      connection: {
        host: 'redis.internal',
        port: 6380,
        password: 'secret',
        maxRetriesPerRequest: null,
      },
      defaultJobOptions: {
        attempts: 5,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: { age: 3600, count: 100 },
        removeOnFail: { age: 86400, count: 500 },
      },
    });
  });

  it('rejects invalid numeric queue configuration', () => {
    const configService = {
      get: (key: string) => (key === 'REDIS_PORT' ? 'not-a-number' : undefined),
      getOrThrow: (key: string) => (key === 'REDIS_HOST' ? 'localhost' : 'not-a-number'),
    } as unknown as ConfigService;

    expect(() => createQueueInfrastructureConfig(configService)).toThrow(
      'REDIS_PORT must be a positive integer',
    );
  });
});
