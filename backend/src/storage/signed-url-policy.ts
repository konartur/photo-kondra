import { NotFoundException, ServiceUnavailableException } from '@nestjs/common';

export const signedUrlLimits = { upload: 900, original: 900, preview: 3600, archive: 3600 };

export function validateSignedUrlTtl(value: number, maximum: number): number {
  if (!Number.isSafeInteger(value) || value <= 0 || value > maximum) {
    throw new ServiceUnavailableException('Invalid signed URL lifetime configuration');
  }
  return value;
}

export function capAccessTtl(ttl: number, expiresAt?: Date | null): number {
  const remaining = expiresAt
    ? Math.min(ttl, Math.floor((expiresAt.getTime() - Date.now()) / 1000))
    : ttl;
  if (remaining <= 0) throw new NotFoundException('Gallery not found');
  return remaining;
}
