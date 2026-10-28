import { ConfigService } from '@nestjs/config';

export const ARCHIVE_GENERATION_CONFIG = Symbol('ARCHIVE_GENERATION_CONFIG');

export interface ArchiveGenerationConfig {
  lockTtlSeconds: number;
  retentionSeconds: number;
  maxSize: number;
}

export function createArchiveGenerationConfig(
  configService: ConfigService,
): ArchiveGenerationConfig {
  return {
    lockTtlSeconds: getPositiveInteger(configService, 'ARCHIVE_PROCESSING_LOCK_TTL', 900),
    retentionSeconds: getPositiveInteger(configService, 'ARCHIVE_RETENTION_TTL', 86400),
    maxSize: getPositiveInteger(configService, 'MAX_ARCHIVE_SIZE', 2147483648),
  };
}

function getPositiveInteger(configService: ConfigService, key: string, fallback: number): number {
  const value = Number(configService.get<string>(key) ?? fallback);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${key} must be a positive integer`);
  }

  return value;
}
