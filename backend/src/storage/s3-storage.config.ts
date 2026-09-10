import { ConfigService } from '@nestjs/config';

export const S3_STORAGE_CONFIG = Symbol('S3_STORAGE_CONFIG');
export const S3_CLIENT = Symbol('S3_CLIENT');
export const S3_PRESIGNED_URL_SIGNER = Symbol('S3_PRESIGNED_URL_SIGNER');

export interface S3StorageConfig {
  region?: string;
  bucket?: string;
  endpoint?: string;
  forcePathStyle: boolean;
  credentials?: {
    accessKeyId: string;
    secretAccessKey: string;
  };
}

export function createS3StorageConfig(configService: ConfigService): S3StorageConfig {
  const accessKeyId = configService.get<string>('AWS_ACCESS_KEY_ID');
  const secretAccessKey = configService.get<string>('AWS_SECRET_ACCESS_KEY');

  if (Boolean(accessKeyId) !== Boolean(secretAccessKey)) {
    throw new Error('AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY must be configured together');
  }

  return {
    region: configService.get<string>('AWS_REGION'),
    bucket: configService.get<string>('AWS_S3_BUCKET'),
    endpoint: configService.get<string>('AWS_S3_ENDPOINT'),
    forcePathStyle: configService.get<string>('AWS_S3_FORCE_PATH_STYLE') === 'true',
    ...(accessKeyId && secretAccessKey && { credentials: { accessKeyId, secretAccessKey } }),
  };
}
