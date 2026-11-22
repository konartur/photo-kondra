import { describe, expect, it, jest } from '@jest/globals';
import type { Queue } from 'bullmq';
import { PortfolioMediaJobs } from './portfolio-media.jobs.js';
import type { PortfolioMediaJobData } from './portfolio-media.config.js';

const id = '12345678-1234-4234-8234-123456789012';
describe('Portfolio processing job admission', () => {
  it('uses a stable job ID and never removes or duplicates an active job', async () => {
    const active = {
      getState: jest.fn<() => Promise<string>>().mockResolvedValue('active'),
      remove: jest.fn(),
      retry: jest.fn(),
    };
    const queue = {
      waitUntilReady: async () => {},
      on: jest.fn(),
      add: jest.fn(),
      close: jest.fn(),
      getJob: jest
        .fn<() => Promise<typeof active | undefined>>()
        .mockResolvedValueOnce(undefined)
        .mockResolvedValue(active),
    };
    const jobs = new PortfolioMediaJobs(queue as unknown as Queue<PortfolioMediaJobData>);
    await expect(jobs.ensureQueued(id)).rejects.toThrow('queue is not ready');
    await jobs.ensureQueued(id);
    await jobs.ensureQueued(id);
    expect(queue.add).toHaveBeenCalledTimes(1);
    expect(queue.add).toHaveBeenCalledWith(
      'process-portfolio-media',
      expect.objectContaining({ mediaId: id }),
      { jobId: id },
    );
    expect(active.remove).not.toHaveBeenCalled();
    expect(active.retry).not.toHaveBeenCalled();
  });
  it('retries a retained failed job with a fresh attempts budget', async () => {
    const failed = {
      getState: jest.fn<() => Promise<string>>().mockResolvedValue('failed'),
      retry: jest.fn(),
      remove: jest.fn(),
    };
    const queue = { on: jest.fn(), waitUntilReady: async () => {}, getJob: jest.fn().mockImplementation(async () => failed) };
    const jobs = new PortfolioMediaJobs(queue as unknown as Queue<PortfolioMediaJobData>);
    await queue.waitUntilReady();
    await jobs.ensureQueued(id);
    expect(failed.retry).toHaveBeenCalledWith('failed', {
      resetAttemptsMade: true,
      resetAttemptsStarted: true,
    });
    expect(failed.remove).not.toHaveBeenCalled();
  });
});
