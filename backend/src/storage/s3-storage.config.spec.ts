import { ConfigService } from '@nestjs/config';
import { describe, expect, it } from '@jest/globals';
import { createS3StorageConfig } from './s3-storage.config.js';

describe('createS3StorageConfig', () => {
  it('uses explicit S3-compatible settings and static credentials when both are configured', () => {
    const values: Record<string, string> = {
      AWS_REGION: 'eu-central-1',
      AWS_S3_BUCKET: 'photo-cloud',
      AWS_S3_ENDPOINT: 'http://localhost:9000',
      AWS_S3_FORCE_PATH_STYLE: 'true',
      AWS_ACCESS_KEY_ID: 'access-key',
      AWS_SECRET_ACCESS_KEY: 'secret-key',
    };
    const configService = { get: (key: string) => values[key] } as ConfigService;

    expect(createS3StorageConfig(configService)).toEqual({
      region: 'eu-central-1',
      bucket: 'photo-cloud',
      endpoint: 'http://localhost:9000',
      forcePathStyle: true,
      credentials: { accessKeyId: 'access-key', secretAccessKey: 'secret-key' },
    });
  });

  it('rejects incomplete static credentials', () => {
    const configService = {
      get: (key: string) => (key === 'AWS_ACCESS_KEY_ID' ? 'access-key' : undefined),
    } as ConfigService;

    expect(() => createS3StorageConfig(configService)).toThrow(
      'AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY must be configured together',
    );
  });
});
