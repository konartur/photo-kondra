import { ConfigService } from '@nestjs/config';

export const PORTFOLIO_MEDIA_CONFIG = Symbol('PORTFOLIO_MEDIA_CONFIG');
export const PORTFOLIO_MEDIA_QUEUE = 'portfolio-media-processing';
export const PORTFOLIO_MEDIA_QUEUE_CLIENT = Symbol('PORTFOLIO_MEDIA_QUEUE_CLIENT');
export const PROCESS_PORTFOLIO_MEDIA = 'process-portfolio-media';
export interface PortfolioMediaJobData {
  mediaId: string;
  requestId?: string;
}
export interface PortfolioMediaConfig {
  maxPixels: number;
  quality: number;
  lockTtlSeconds: number;
  processingTimeoutSeconds: number;
  maintenanceIntervalSeconds: number;
}
export function createPortfolioMediaConfig(config: ConfigService): PortfolioMediaConfig {
  const integer = (key: string, fallback: number) => {
    const value = Number(config.get<string>(key) ?? fallback);
    if (!Number.isSafeInteger(value) || value <= 0)
      throw new Error(`${key} must be a positive integer`);
    return value;
  };
  const result = {
    maxPixels: integer('PORTFOLIO_MEDIA_MAX_PIXELS', 40_000_000),
    quality: integer('PORTFOLIO_MEDIA_WEBP_QUALITY', 82),
    lockTtlSeconds: integer('PORTFOLIO_MEDIA_LOCK_TTL', 900),
    processingTimeoutSeconds: integer('PORTFOLIO_MEDIA_PROCESSING_TIMEOUT', 120),
    maintenanceIntervalSeconds: integer('PORTFOLIO_MEDIA_MAINTENANCE_INTERVAL', 30),
  };
  if (result.quality > 100 || result.lockTtlSeconds <= 2 * result.processingTimeoutSeconds + 60)
    throw new Error('Invalid portfolio quality or processing lease margin');
  return result;
}

export class TerminalPortfolioMediaError extends Error {
  override name = 'TerminalPortfolioMediaError';
}
export class PortfolioMediaLeaseBusyError extends Error {
  constructor(readonly retryAt: number) {
    super('Portfolio media lease is busy');
  }
}
export class PortfolioMediaClaimLostError extends Error {
  constructor() {
    super('Portfolio media claim lost');
  }
}

export function assertPortfolioKey(mediaId: string, key: string): void {
  if (
    !/^[0-9a-f-]{36}$/i.test(mediaId) ||
    !key.startsWith(`portfolio/media/${mediaId}/`) ||
    key.includes('..')
  )
    throw new Error('Invalid portfolio object namespace');
}
