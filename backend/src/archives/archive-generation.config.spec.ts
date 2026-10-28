import { ConfigService } from '@nestjs/config';
import { describe, expect, it } from '@jest/globals';
import { createArchiveGenerationConfig } from './archive-generation.config.js';

describe('archive configuration', () => {
  it('provides a processing deadline, retention and byte limit', () => {
    expect(createArchiveGenerationConfig(new ConfigService())).toEqual({
      lockTtlSeconds: 900,
      retentionSeconds: 0,
      maxSize: 2147483648,
    });
  });
  it.each(['ARCHIVE_PROCESSING_LOCK_TTL', 'ARCHIVE_RETENTION_TTL', 'MAX_ARCHIVE_SIZE'])(
    'rejects invalid %s',
    (key) => {
      expect(() => createArchiveGenerationConfig(new ConfigService({ [key]: '-1' }))).toThrow(key);
    },
  );
});
