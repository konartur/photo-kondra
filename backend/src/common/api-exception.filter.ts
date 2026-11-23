import { ArgumentsHost, Catch, ExceptionFilter, HttpException } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AppLogger, safeErrorDetails } from './logging/app-logger.js';
import { correlationId, currentLogContext } from './logging/log-context.js';

const errors: Record<number, [string, string]> = {
  400: ['BAD_REQUEST', 'Invalid request'],
  401: ['UNAUTHORIZED', 'Authentication required'],
  403: ['FORBIDDEN', 'Access denied'],
  404: ['NOT_FOUND', 'Resource not found'],
  409: ['CONFLICT', 'Request conflicts with the current resource state'],
  410: ['GONE', 'Resource expired'],
  413: ['PAYLOAD_TOO_LARGE', 'Request body is too large'],
  415: ['UNSUPPORTED_MEDIA_TYPE', 'Unsupported request encoding or media type'],
  422: ['UNPROCESSABLE_ENTITY', 'Request could not be processed'],
  429: ['RATE_LIMIT_EXCEEDED', 'Too many requests; please try again later'],
  500: ['INTERNAL_SERVER_ERROR', 'An unexpected error occurred'],
  503: ['SERVICE_UNAVAILABLE', 'Service is temporarily unavailable'],
};

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new AppLogger(ApiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const response = http.getResponse<Response>();
    if (response.headersSent) return;
    let statusCode = 500;
    let payload: unknown;
    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      payload = exception.getResponse();
    } else if (typeof exception === 'object' && exception !== null && 'type' in exception) {
      // Body-parser errors can contain the entire submitted body in their message/body.
      const parserStatus: Record<string, number> = {
        'entity.too.large': 413,
        'entity.parse.failed': 400,
        'parameters.too.many': 413,
        'encoding.unsupported': 415,
        'charset.unsupported': 415,
        'request.aborted': 400,
        'request.size.invalid': 400,
      };
      if (typeof exception.type === 'string') statusCode = parserStatus[exception.type] ?? 500;
    }
    let [code, message] = errors[statusCode] ?? ['HTTP_ERROR', 'Request failed'];
    if (statusCode < 500 && typeof payload === 'object' && payload !== null) {
      if (
        'code' in payload &&
        typeof payload.code === 'string' &&
        /^[A-Z][A-Z0-9_]{0,79}$/.test(payload.code)
      )
        code = payload.code;
      if (
        'message' in payload &&
        typeof payload.message === 'string' &&
        !/^Cannot [A-Z]+ /.test(payload.message) &&
        !payload.message.startsWith('Failed to decode param')
      )
        message = payload.message;
    }
    if (statusCode >= 500) {
      const requestId = currentLogContext().requestId ?? correlationId();
      response.setHeader('X-Request-Id', requestId);
      // Do not serialize exceptions, URLs, bodies or headers: they may contain private tokens.
      this.logger.error({
        event: 'http_request_failed',
        requestId,
        statusCode,
        ...safeErrorDetails(exception),
      });
    }
    response.setHeader('Cache-Control', 'no-store');
    const fields =
      ((statusCode === 400 && code === 'VALIDATION_FAILED') ||
        (statusCode === 409 && ['PORTFOLIO_NOT_READY', 'PORTFOLIO_STORY_SERVICE_UNPUBLISHED'].includes(code))) &&
      typeof payload === 'object' &&
      payload !== null &&
      'errors' in payload &&
      Array.isArray(payload.errors) &&
      http.getRequest<Request>()?.path.startsWith('/api/v1/portfolio/')
        ? (payload.errors as unknown[]).flatMap(error => {
            if (!error || typeof error !== 'object' || !('field' in error) || !('code' in error)
              || typeof error.field !== 'string' || typeof error.code !== 'string'
              || error.field.length > 256 || !/^[A-Za-z][A-Za-z0-9]*(?:\.(?:[A-Za-z][A-Za-z0-9]*|[0-9]+))*$/.test(error.field)
              || !/^[A-Z][A-Z0-9_]{0,79}$/.test(error.code)) return [];
            return [{ field: error.field, code: error.code }];
          }).slice(0, 50)
        : [];
    response.status(statusCode).json({ statusCode, code, message, ...(fields.length ? { errors: fields } : {}) });
  }
}
