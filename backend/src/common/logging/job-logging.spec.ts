import { Logger } from '@nestjs/common';
import { DelayedError, UnrecoverableError } from 'bullmq';
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { randomUUID } from 'node:crypto';
import { AppLogger } from './app-logger.js';
import { currentLogContext, jobCorrelation, withLogContext } from './log-context.js';
import { JobLogger, logTransportError } from './job-logging.js';
import { createApplicationLogger, loggingLevels } from './logging.config.js';

afterEach(() => {
  jest.restoreAllMocks();
});
describe('background job observability', () => {
  it('carries request identity into queue data and restores it for all async job logs', async () => {
    const sink = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    const requestId = randomUUID(),
      photoId = randomUUID();
    const data = withLogContext({ requestId }, () => ({ photoId, ...jobCorrelation() }));
    expect(data.requestId).toBe(requestId);
    await new JobLogger('image-processing').run(
      { id: '15', data, attemptsMade: 1, opts: { attempts: 3 } },
      async () => {
        await Promise.resolve();
        new AppLogger('ImageProcessingService').log({
          event: 'image_processing_completed',
          photoId,
        });
      },
    );
    expect(sink).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'job_started',
        requestId,
        jobId: '15',
        attemptsMade: 1,
        maxAttempts: 3,
      }),
    );
    expect(sink).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'image_processing_completed',
        requestId,
        jobId: '15',
        photoId,
      }),
    );
    expect(sink).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'job_completed', durationMs: expect.any(Number) }),
    );
    expect(currentLogContext()).toEqual({});
  });
  it.each([
    {
      attemptsMade: 0,
      error: new Error('private-token'),
      level: 'warn' as const,
      event: 'job_attempt_failed',
    },
    {
      attemptsMade: 2,
      error: new Error('private-token'),
      level: 'error' as const,
      event: 'job_exhausted',
    },
    {
      attemptsMade: 0,
      error: new UnrecoverableError('private-token'),
      level: 'error' as const,
      event: 'job_exhausted',
    },
  ])(
    'logs $event at $level while preserving the thrown error',
    async ({ attemptsMade, error, level, event }) => {
      const sink = jest.spyOn(Logger.prototype, level).mockImplementation(() => {});
      await expect(
        new JobLogger('archive-generation').run(
          { id: '25', data: { requestId: 'private-token' }, attemptsMade, opts: { attempts: 3 } },
          async () => {
            throw error;
          },
        ),
      ).rejects.toBe(error);
      expect(sink).toHaveBeenCalledWith(
        expect.objectContaining({ event, jobId: '25', queue: 'archive-generation' }),
      );
      expect(JSON.stringify(sink.mock.calls)).not.toContain('private-token');
    },
  );
  it('does not mistake lease deferral for a failed attempt', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    const error = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
    await expect(
      new JobLogger('archive-generation').run(
        { id: '26', data: {}, attemptsMade: 0, opts: {} },
        async () => {
          throw new DelayedError();
        },
      ),
    ).rejects.toBeInstanceOf(DelayedError);
    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });
  it('does not attach an unrelated request identity to transport errors', () => {
    const sink = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
    withLogContext({ requestId: randomUUID() }, () =>
      logTransportError('queue_error', 'image-processing', new Error('redis://user:password@host')),
    );
    expect(sink).toHaveBeenCalledWith({
      event: 'queue_error',
      queue: 'image-processing',
      errorName: 'Error',
      errorCode: 'UNEXPECTED_ERROR',
    });
  });
  it('uses production-friendly levels and rejects invalid configuration without echoing it', () => {
    expect(loggingLevels('info')).not.toContain('debug');
    expect(loggingLevels('debug')).toContain('debug');
    expect(() => loggingLevels('private-token')).toThrow(
      'LOG_LEVEL must be debug, info, warn or error',
    );
  });
  it('logs each processor attempt once across the subsequent failed event and resets for retries', async () => {
    const sink = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    const observer = new JobLogger('image-processing');
    const error = new Error('private-token');
    const job = {
      id: '30',
      data: { requestId: randomUUID() },
      opts: { attempts: 3 },
      attemptsMade: 0,
    };
    for (let attempt = 0; attempt < 2; attempt++) {
      await expect(
        observer.run(job, async () => {
          throw error;
        }),
      ).rejects.toBe(error);
      job.attemptsMade++;
      observer.failed(job, error);
      expect(sink).toHaveBeenCalledTimes(attempt + 1);
    }
    expect(JSON.stringify(sink.mock.calls)).not.toContain('private-token');
  });
  it('does not suppress a different job that shares the same Error instance', async () => {
    const sink = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    const observer = new JobLogger('archive-generation');
    const error = new Error('private-token');
    const first = {
      id: '31',
      data: { requestId: randomUUID() },
      opts: { attempts: 3 },
      attemptsMade: 0,
    };
    await expect(
      observer.run(first, async () => {
        throw error;
      }),
    ).rejects.toBe(error);
    const second = { ...first, id: '32', data: { requestId: randomUUID() }, attemptsMade: 1 };
    observer.failed(second, error);
    expect(sink).toHaveBeenCalledTimes(2);
    expect(sink).toHaveBeenLastCalledWith(
      expect.objectContaining({ jobId: '32', requestId: second.data.requestId, attemptsMade: 0 }),
    );
  });
  it('reports a failure without a job safely, without borrowing the active HTTP identity', () => {
    const sink = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
    withLogContext({ requestId: randomUUID() }, () =>
      new JobLogger('image-processing').failed(undefined, new Error('private-token')),
    );
    expect(sink).toHaveBeenCalledWith({
      event: 'job_exhausted',
      queue: 'image-processing',
      attemptsMade: 0,
      maxAttempts: 1,
      errorName: 'Error',
      errorCode: 'UNEXPECTED_ERROR',
    });
  });
  it('writes a parseable JSON record without ANSI colors through the production logger', () => {
    jest.replaceProperty(process, 'env', { ...process.env, LOG_LEVEL: 'info' });
    const output = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
    createApplicationLogger().log({ event: 'upload_created', photoId: randomUUID() });
    const line = String(output.mock.calls[0]?.[0]);
    expect(line).not.toContain('\u001b[');
    expect(JSON.parse(line)).toEqual(
      expect.objectContaining({
        level: 'log',
        message: expect.objectContaining({ event: 'upload_created' }),
      }),
    );
  });
});
