import { ArgumentsHost, HttpException, Logger, ServiceUnavailableException } from '@nestjs/common';
import { beforeEach, afterEach, describe, expect, it, jest } from '@jest/globals';
import { ApiExceptionFilter } from './api-exception.filter.js';

describe('ApiExceptionFilter', () => {
  const response = { headersSent: false, setHeader: jest.fn(), status: jest.fn(), json: jest.fn() };
  const host = {
    switchToHttp: () => ({ getResponse: () => response }),
  } as unknown as ArgumentsHost;
  beforeEach(() => {
    jest.clearAllMocks();
    response.status.mockReturnValue(response);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it.each([
    new Error('private-token database-password'),
    new ServiceUnavailableException('AWS_SECRET=private-token'),
  ])('redacts unexpected and server errors from responses and logs', (error) => {
    new ApiExceptionFilter().catch(error, host);
    const serialized = JSON.stringify([
      response.json.mock.calls,
      jest.mocked(Logger.prototype.error).mock.calls,
    ]);
    expect(serialized).not.toMatch(/private-token|database-password|AWS_SECRET/);
    expect(response.setHeader).toHaveBeenCalledWith('X-Request-Id', expect.any(String));
    expect(response.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
  });
  it('recognizes parser size failures without exposing their submitted body', () => {
    new ApiExceptionFilter().catch(
      { type: 'entity.too.large', status: 413, body: 'private-token' },
      host,
    );
    expect(response.status).toHaveBeenCalledWith(413);
    expect(response.json).toHaveBeenCalledWith({
      statusCode: 413,
      code: 'PAYLOAD_TOO_LARGE',
      message: 'Request body is too large',
    });
  });
  it('preserves explicit safe application codes', () => {
    new ApiExceptionFilter().catch(
      new HttpException(
        { code: 'CORS_ORIGIN_DENIED', message: 'Origin is not allowed', extra: 'private-token' },
        403,
      ),
      host,
    );
    expect(response.json).toHaveBeenCalledWith({
      statusCode: 403,
      code: 'CORS_ORIGIN_DENIED',
      message: 'Origin is not allowed',
    });
  });
});
