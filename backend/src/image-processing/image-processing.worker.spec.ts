import { Logger } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { Job, Processor } from 'bullmq';
import { randomUUID } from 'node:crypto';
import type { ImageProcessingService } from './image-processing.service.js';
import type { ProcessPhotoJobData } from '../queues/queue.constants.js';
import type { QueueInfrastructureConfig } from '../queues/queue.config.js';

const bullmq = await import('bullmq');
const on = jest.fn();
const worker = jest.fn().mockImplementation(() => ({ on, close: jest.fn() }));
jest.unstable_mockModule('bullmq', () => ({ ...bullmq, Worker: worker }));
const { ImageProcessingWorker } = await import('./image-processing.worker.js');

describe('image worker logging boundary', () => {
  const process = jest.fn<ImageProcessingService['process']>();
  beforeEach(() => {
    jest.clearAllMocks();
    process.mockResolvedValue();
    new ImageProcessingWorker(
      { process } as unknown as ImageProcessingService,
      { connection: {} } as QueueInfrastructureConfig,
    );
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });
  it('runs the processor with correlated request/job identity', async () => {
    const sink = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    const data = { photoId: randomUUID(), requestId: randomUUID() };
    const processor = worker.mock.calls[0]![1] as Processor<ProcessPhotoJobData>;
    await processor(
      { id: '55', data, opts: { attempts: 3 }, attemptsMade: 0 } as Job<ProcessPhotoJobData>,
      'lock',
    );
    expect(process).toHaveBeenCalledWith(data);
    expect(sink).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'job_completed',
        requestId: data.requestId,
        jobId: '55',
        queue: 'image-processing',
      }),
    );
  });
  it('handles transport errors without letting BullMQ print raw dependency errors', () => {
    const sink = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
    const listener = on.mock.calls.find(([event]) => event === 'error')?.[1] as (
      error: Error,
    ) => void;
    expect(listener).toBeDefined();
    listener(Object.assign(new Error('redis://password@host'), { name: 'private-token' }));
    expect(sink).toHaveBeenCalledWith({
      event: 'worker_error',
      queue: 'image-processing',
      errorName: 'UnknownError',
      errorCode: 'UNEXPECTED_ERROR',
    });
  });
  it('logs a final failure emitted before the processor runs', () => {
    const sink = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
    const data = { photoId: randomUUID(), requestId: randomUUID() };
    const failed = on.mock.calls.find(([event]) => event === 'failed')?.[1] as (
      job: Job<ProcessPhotoJobData>,
      error: Error,
    ) => void;
    expect(failed).toBeDefined();
    failed(
      { id: '56', data, attemptsMade: 1, opts: { attempts: 3 } } as Job<ProcessPhotoJobData>,
      new bullmq.UnrecoverableError('private-token https://storage.invalid/signed'),
    );
    expect(process).not.toHaveBeenCalled();
    expect(sink).toHaveBeenCalledTimes(1);
    expect(sink).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'job_exhausted',
        requestId: data.requestId,
        jobId: '56',
        queue: 'image-processing',
      }),
    );
    expect(JSON.stringify(sink.mock.calls)).not.toMatch(/private-token|storage.invalid/);
  });
  it('does not duplicate a processor failure when BullMQ emits failed', async () => {
    const sink = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    const error = new Error('private-token');
    process.mockRejectedValueOnce(error);
    const job = {
      id: '57',
      data: { photoId: randomUUID(), requestId: randomUUID() },
      opts: { attempts: 3 },
      attemptsMade: 0,
    } as Job<ProcessPhotoJobData>;
    const processor = worker.mock.calls[0]![1] as Processor<ProcessPhotoJobData>;
    await expect(processor(job, 'lock')).rejects.toBe(error);
    job.attemptsMade++;
    const failed = on.mock.calls.find(([event]) => event === 'failed')?.[1] as (
      job: Job<ProcessPhotoJobData>,
      error: Error,
    ) => void;
    failed(job, error);
    expect(sink).toHaveBeenCalledTimes(1);
  });
});
