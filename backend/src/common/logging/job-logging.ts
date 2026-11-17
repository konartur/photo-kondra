import { DelayedError, UnrecoverableError } from 'bullmq';
import type { Job } from 'bullmq';
import { AppLogger, safeErrorDetails } from './app-logger.js';
import { correlationId, withLogContext } from './log-context.js';

type QueueName = 'image-processing' | 'archive-generation';
type CorrelatedJob<T> = Pick<
  Job<T & { requestId?: string }>,
  'id' | 'data' | 'opts' | 'attemptsMade'
>;
const logger = new AppLogger('BackgroundJob');

export class JobLogger {
  // Weak keys do not retain finished jobs; identity is per job, not per shared Error instance.
  private readonly reportedFailures = new WeakMap<object, unknown>();

  constructor(private readonly queue: QueueName) {}

  async run<T>(job: CorrelatedJob<T>, action: () => Promise<void>): Promise<void> {
    this.reportedFailures.delete(job);
    return withLogContext(
      {
        requestId: correlationId(job.data.requestId),
        jobId: job.id,
        queue: this.queue,
        attemptsMade: job.attemptsMade,
      },
      async () => {
        const started = performance.now();
        const maxAttempts = job.opts.attempts ?? 1;
        logger.log({ event: 'job_started', maxAttempts });
        try {
          await action();
          logger.log({
            event: 'job_completed',
            durationMs: Math.round(performance.now() - started),
          });
        } catch (error) {
          if (error instanceof DelayedError) logger.debug({ event: 'job_delayed' });
          else {
            this.writeFailure(
              error,
              job.attemptsMade,
              maxAttempts,
              Math.round(performance.now() - started),
            );
            this.reportedFailures.set(job, error);
          }
          throw error;
        }
      },
    );
  }

  failed<T>(job: CorrelatedJob<T> | undefined, error: unknown): void {
    if (error instanceof DelayedError) return;
    if (job && this.reportedFailures.has(job)) {
      const reported = this.reportedFailures.get(job);
      this.reportedFailures.delete(job);
      if (reported === error) return;
    }
    // BullMQ emits failed after moveToFailed has incremented attemptsMade.
    const attemptsMade = Math.max(0, (job?.attemptsMade ?? 1) - 1);
    withLogContext(
      {
        requestId: job ? correlationId(job.data.requestId) : undefined,
        jobId: job?.id,
        queue: this.queue,
        attemptsMade,
      },
      () => this.writeFailure(error, attemptsMade, Math.max(1, job?.opts.attempts ?? 1)),
    );
  }

  private writeFailure(
    error: unknown,
    attemptsMade: number,
    maxAttempts: number,
    durationMs?: number,
  ): void {
    const final = error instanceof UnrecoverableError || attemptsMade + 1 >= maxAttempts;
    const entry = {
      event: final ? ('job_exhausted' as const) : ('job_attempt_failed' as const),
      maxAttempts,
      durationMs,
      ...safeErrorDetails(error),
    };
    if (final) logger.error(entry);
    else logger.warn(entry);
  }
}

export function logTransportError(
  event: 'queue_error' | 'worker_error',
  queue: QueueName,
  error: unknown,
): void {
  // Transport errors have no trustworthy request context or payload.
  withLogContext({ queue }, () => logger.error({ event, ...safeErrorDetails(error) }));
}
