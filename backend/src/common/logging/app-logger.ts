import { Logger } from '@nestjs/common';
import { currentLogContext } from './log-context.js';

const events = [
  'http_request_completed',
  'http_request_failed',
  'authentication_failed',
  'upload_created',
  'upload_completed',
  'image_job_enqueued',
  'archive_job_enqueued',
  'job_enqueue_failed',
  'job_started',
  'job_completed',
  'job_attempt_failed',
  'job_delayed',
  'job_exhausted',
  'worker_error',
  'queue_error',
  'image_processing_started',
  'image_processing_completed',
  'image_processing_failed',
  'image_cleanup_failed',
  'access_link_created',
  'access_link_revoked',
  'archive_progress',
  'archive_progress_publish_failed',
  'archive_generation_failed',
  'archive_photo_started',
  'archive_photo_read_failed',
  'archive_photo_completed',
  'archive_cleanup_failed',
  'selected_archive_cleanup_failed',
  'portfolio_media_upload_created',
  'portfolio_media_upload_completed',
  'portfolio_media_processing_started',
  'portfolio_media_processing_completed',
  'portfolio_media_processing_failed',
  'portfolio_media_cleanup_deferred',
  'portfolio_media_deleted',
] as const;
type LogEvent = (typeof events)[number];
export interface LogEntry {
  event: LogEvent;
  [field: string]: unknown;
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ids = new Set([
  'requestId',
  'photoId',
  'galleryId',
  'archiveId',
  'accessLinkId',
  'userId',
  'mediaId',
]);
const numbers = new Set([
  'statusCode',
  'durationMs',
  'attemptsMade',
  'maxAttempts',
  'readBytes',
  'totalOriginalBytes',
  'readPercent',
  'uploadedBytes',
  'totalZipBytes',
  'uploadPercent',
  'readBytesPerSecond',
  'uploadBytesPerSecond',
  'photoReadBytes',
  'photoPercent',
  'readIdleSeconds',
  'uploadIdleSeconds',
  'elapsedSeconds',
  'originalBytes',
]);
const enums: Record<string, readonly string[]> = {
  queue: ['image-processing', 'archive-generation', 'portfolio-media-processing'],
  phase: ['streaming', 'publishing', 'ready', 'failed'],
  operation: ['login', 'refresh', 'upload', 'archive'],
  method: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  errorName: [
    'Error',
    'TypeError',
    'RangeError',
    'UnrecoverableError',
    'UnknownError',
    'TerminalProcessingError',
    'TerminalArchiveError',
    'TerminalPortfolioMediaError',
  ],
  errorCode: [
    'ACCESS_DENIED',
    'NOT_FOUND',
    'TIMEOUT',
    'CONNECTION_FAILED',
    'INVALID_IMAGE',
    'ARCHIVE_INPUT_INVALID',
    'UNEXPECTED_ERROR',
  ],
};

export function safeErrorDetails(error: unknown): { errorName: string; errorCode: string } {
  const object = typeof error === 'object' && error !== null ? error : {};
  let name: unknown;
  let code: unknown;
  try {
    name = 'name' in object ? object.name : undefined;
    code = 'code' in object ? object.code : undefined;
  } catch {
    // Diagnostic code must not replace the original failure if a dependency exposes getters.
    return { errorName: 'UnknownError', errorCode: 'UNEXPECTED_ERROR' };
  }
  const category = [name, code].find(
    (value) =>
      typeof value === 'string' &&
      [
        'AccessDenied',
        'NotFound',
        'NoSuchKey',
        'ETIMEDOUT',
        'TimeoutError',
        'ECONNREFUSED',
        'ECONNRESET',
        'TerminalProcessingError',
        'TerminalArchiveError',
        'TerminalPortfolioMediaError',
      ].includes(value),
  );
  const codes: Record<string, string> = {
    AccessDenied: 'ACCESS_DENIED',
    NotFound: 'NOT_FOUND',
    NoSuchKey: 'NOT_FOUND',
    ETIMEDOUT: 'TIMEOUT',
    TimeoutError: 'TIMEOUT',
    ECONNREFUSED: 'CONNECTION_FAILED',
    ECONNRESET: 'CONNECTION_FAILED',
    TerminalProcessingError: 'INVALID_IMAGE',
    TerminalArchiveError: 'ARCHIVE_INPUT_INVALID',
    TerminalPortfolioMediaError: 'INVALID_IMAGE',
  };
  return {
    errorName: typeof name === 'string' && enums.errorName.includes(name) ? name : 'UnknownError',
    errorCode: typeof category === 'string' ? codes[category] : 'UNEXPECTED_ERROR',
  };
}

// Allowlisted scalar fields only. Unknown fields and nested payloads are omitted, not serialized.
export class AppLogger {
  private readonly logger: Logger;
  constructor(context: string) {
    this.logger = new Logger(context);
  }
  log(entry: LogEntry): void {
    this.write('log', entry);
  }
  debug(entry: LogEntry): void {
    this.write('debug', entry);
  }
  warn(entry: LogEntry): void {
    this.write('warn', entry);
  }
  error(entry: LogEntry): void {
    this.write('error', entry);
  }
  private write(level: 'log' | 'debug' | 'warn' | 'error', entry: LogEntry): void {
    const record: Record<string, unknown> = {
      event: events.includes(entry.event) ? entry.event : 'http_request_failed',
    };
    for (const [key, value] of Object.entries({ ...currentLogContext(), ...entry })) {
      if (ids.has(key) && typeof value === 'string' && uuid.test(value)) record[key] = value;
      else if (
        key === 'jobId' &&
        typeof value === 'string' &&
        (uuid.test(value) || /^\d{1,20}$/.test(value))
      )
        record[key] = value;
      else if (
        numbers.has(key) &&
        typeof value === 'number' &&
        Number.isFinite(value) &&
        value >= 0
      )
        record[key] = value;
      else if (typeof value === 'string' && Object.hasOwn(enums, key) && enums[key].includes(value))
        record[key] = value;
    }
    this.logger[level](record);
  }
}
