import { ConfigService } from '@nestjs/config';

export const IMAGE_PROCESSING_CONFIG = Symbol('IMAGE_PROCESSING_CONFIG');

export interface ImageProcessingConfig {
  thumbnailWidth: number;
  previewWidth: number;
  lockTtlSeconds: number;
}

export function createImageProcessingConfig(configService: ConfigService): ImageProcessingConfig {
  return {
    thumbnailWidth: getPositiveInteger(configService, 'IMAGE_THUMBNAIL_WIDTH', 300),
    previewWidth: getPositiveInteger(configService, 'IMAGE_PREVIEW_WIDTH', 1600),
    lockTtlSeconds: getPositiveInteger(configService, 'IMAGE_PROCESSING_LOCK_TTL', 900),
  };
}

function getPositiveInteger(configService: ConfigService, key: string, fallback: number): number {
  const value = Number(configService.get<string>(key) ?? fallback);

  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${key} must be a positive integer`);
  }

  return value;
}
