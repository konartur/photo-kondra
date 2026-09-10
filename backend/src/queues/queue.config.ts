import { ConfigService } from '@nestjs/config';

export const QUEUE_CONFIG = Symbol('QUEUE_CONFIG');

export interface QueueInfrastructureConfig {
  connection: {
    host: string;
    port: number;
    password?: string;
    maxRetriesPerRequest: null;
  };
  defaultJobOptions: {
    attempts: number;
    backoff: { type: 'exponential'; delay: number };
    removeOnComplete: { age: number; count: number };
    removeOnFail: { age: number; count: number };
  };
}

export function createQueueInfrastructureConfig(
  configService: ConfigService,
): QueueInfrastructureConfig {
  const password = configService.get<string>('REDIS_PASSWORD');

  return {
    connection: {
      host: configService.getOrThrow<string>('REDIS_HOST'),
      port: getPositiveInteger(configService, 'REDIS_PORT'),
      ...(password && { password }),
      maxRetriesPerRequest: null,
    },
    defaultJobOptions: {
      attempts: getPositiveInteger(configService, 'QUEUE_DEFAULT_ATTEMPTS', 3),
      backoff: {
        type: 'exponential',
        delay: getPositiveInteger(configService, 'QUEUE_BACKOFF_DELAY', 1000),
      },
      removeOnComplete: {
        age: getPositiveInteger(configService, 'QUEUE_REMOVE_ON_COMPLETE_AGE', 86_400),
        count: getPositiveInteger(configService, 'QUEUE_REMOVE_ON_COMPLETE_COUNT', 1000),
      },
      removeOnFail: {
        age: getPositiveInteger(configService, 'QUEUE_REMOVE_ON_FAIL_AGE', 604_800),
        count: getPositiveInteger(configService, 'QUEUE_REMOVE_ON_FAIL_COUNT', 5000),
      },
    },
  };
}

function getPositiveInteger(configService: ConfigService, key: string, fallback?: number): number {
  const configuredValue = configService.get<string>(key);
  const value = Number(configuredValue ?? fallback ?? configService.getOrThrow<string>(key));

  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${key} must be a positive integer`);
  }

  return value;
}
