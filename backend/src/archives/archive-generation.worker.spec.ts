import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { Job, Processor } from 'bullmq';
import type { GenerateArchiveJobData } from '../queues/queue.constants.js';
import type { QueueInfrastructureConfig } from '../queues/queue.config.js';
import type { ArchiveGenerationService } from './archive-generation.service.js';
import { ArchiveLeaseBusyError } from './archive-lease-busy.error.js';

const bullmq = await import('bullmq');
const worker = jest.fn().mockImplementation(() => ({ on: jest.fn(), close: jest.fn() }));
jest.unstable_mockModule('bullmq', () => ({ ...bullmq, Worker: worker }));
const { ArchiveGenerationWorker } = await import('./archive-generation.worker.js');

describe('archive worker lease conflicts', () => {
  const process = jest.fn<ArchiveGenerationService['process']>();
  const moveToDelayed = jest.fn<Job['moveToDelayed']>();
  const job = { data: { archiveId: 'id' }, moveToDelayed, updateProgress: jest.fn() } as unknown as Job<GenerateArchiveJobData>;
  let processor: Processor<GenerateArchiveJobData>;
  beforeEach(() => {
    jest.clearAllMocks(); process.mockReset();
    new ArchiveGenerationWorker({ process } as unknown as ArchiveGenerationService, {connection:{}} as QueueInfrastructureConfig);
    processor = worker.mock.calls[0]![1] as Processor<GenerateArchiveJobData>;
  });

  it('delays a lease conflict with the BullMQ lock token instead of completing the job', async () => {
    process.mockRejectedValue(new ArchiveLeaseBusyError(12345));
    await expect(processor(job, 'lock-token')).rejects.toBeInstanceOf(bullmq.DelayedError);
    expect(moveToDelayed).toHaveBeenCalledWith(12345, 'lock-token');
  });

  it('keeps ordinary failures eligible for normal BullMQ retries', async () => {
    process.mockRejectedValue(new Error('Storage failed'));
    await expect(processor(job, 'lock-token')).rejects.toThrow('Storage failed');
    expect(moveToDelayed).not.toHaveBeenCalled();
  });
});
