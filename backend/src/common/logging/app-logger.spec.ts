import { Logger } from '@nestjs/common';
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { randomUUID } from 'node:crypto';
import { AppLogger, safeErrorDetails } from './app-logger.js';
import { currentLogContext, withLogContext } from './log-context.js';

afterEach(() => {
  jest.restoreAllMocks();
});
describe('safe structured logging', () => {
  it('omits secrets, nested objects and unexpected strings even in allowlisted fields', () => {
    const sink = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    const secret = 'https://storage.invalid/key?X-Amz-Signature=private-token';
    const requestId = randomUUID();
    withLogContext({ requestId }, () =>
      new AppLogger('test').warn({
        event: 'authentication_failed',
        password: secret,
        constructor: secret,
        token: secret,
        key: secret,
        headers: { authorization: secret },
        body: { nested: { password: secret } },
        photoId: secret,
        jobId: secret,
        errorName: secret,
        operation: 'login',
        error: Object.assign(new Error(secret), { name: secret, code: secret, cause: { secret } }),
      }),
    );
    expect(sink).toHaveBeenCalledWith({
      event: 'authentication_failed',
      requestId,
      operation: 'login',
    });
    expect(JSON.stringify(sink.mock.calls)).not.toContain('private-token');
  });
  it('classifies errors without serializing names, codes, messages, stacks or causes', () => {
    const secret = 'raw-private-gallery-token';
    expect(
      safeErrorDetails(
        Object.assign(new Error(secret), { name: secret, code: secret, cause: new Error(secret) }),
      ),
    ).toEqual({ errorName: 'UnknownError', errorCode: 'UNEXPECTED_ERROR' });
    expect(safeErrorDetails({ name: 'AccessDenied', message: secret })).toEqual({
      errorName: 'UnknownError',
      errorCode: 'ACCESS_DENIED',
    });
  });
  it('isolates concurrent asynchronous request/job contexts', async () => {
    const first = randomUUID(),
      second = randomUUID();
    const seen = await Promise.all(
      [first, second].map((requestId) =>
        withLogContext({ requestId }, async () => {
          await new Promise((resolve) => setTimeout(resolve, 1));
          return currentLogContext().requestId;
        }),
      ),
    );
    expect(seen).toEqual([first, second]);
    expect(currentLogContext()).toEqual({});
  });
  it('does not let a throwing error getter replace the application failure', () => {
    const error = {
      get name() {
        throw new Error('private-token');
      },
    };
    expect(safeErrorDetails(error)).toEqual({
      errorName: 'UnknownError',
      errorCode: 'UNEXPECTED_ERROR',
    });
  });
});
