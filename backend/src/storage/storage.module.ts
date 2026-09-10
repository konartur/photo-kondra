import { S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createS3StorageConfig,
  S3_CLIENT,
  S3_PRESIGNED_URL_SIGNER,
  S3_STORAGE_CONFIG,
} from './s3-storage.config.js';
import { S3StorageService } from './s3-storage.service.js';
import { STORAGE_SERVICE } from './storage.service.js';

@Module({
  providers: [
    {
      provide: S3_STORAGE_CONFIG,
      inject: [ConfigService],
      useFactory: createS3StorageConfig,
    },
    {
      provide: S3_CLIENT,
      inject: [S3_STORAGE_CONFIG],
      useFactory: (config: ReturnType<typeof createS3StorageConfig>) =>
        new S3Client({ ...config, region: config.region || 'us-east-1' }),
    },
    { provide: S3_PRESIGNED_URL_SIGNER, useValue: getSignedUrl },
    S3StorageService,
    { provide: STORAGE_SERVICE, useExisting: S3StorageService },
  ],
  exports: [STORAGE_SERVICE],
})
export class StorageModule {}
