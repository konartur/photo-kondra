import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

export interface LogContext {
  requestId?: string;
  jobId?: string;
  queue?: 'image-processing' | 'archive-generation';
  attemptsMade?: number;
}

// One explicit process-local context boundary, isolated per request/job, never a shared mutable store.
const context = new AsyncLocalStorage<LogContext>();
export function currentLogContext(): LogContext {
  return context.getStore() ?? {};
}
export function withLogContext<T>(value: LogContext, action: () => T): T {
  return context.run(value, action);
}
export function correlationId(value?: string): string {
  return typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
    ? value
    : randomUUID();
}
export function jobCorrelation(): { requestId?: string } {
  const { requestId } = currentLogContext();
  return requestId ? { requestId } : {};
}
