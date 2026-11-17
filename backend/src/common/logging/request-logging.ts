import type { RequestHandler } from 'express';
import { AppLogger } from './app-logger.js';
import { correlationId, withLogContext } from './log-context.js';

export function requestLogging(): RequestHandler {
  const logger = new AppLogger('HttpRequest');
  return (request, response, next) => {
    // Never trust caller-supplied IDs or log raw routes: private tokens are path parameters.
    const requestId = correlationId();
    response.setHeader('X-Request-Id', requestId);
    const started = performance.now();
    withLogContext({ requestId }, () => {
      response.once('finish', () => {
        withLogContext({ requestId }, () => {
          const entry = {
            event: 'http_request_completed' as const,
            method: request.method,
            statusCode: response.statusCode,
            durationMs: Math.round(performance.now() - started),
          };
          if (response.statusCode >= 500) logger.error(entry);
          else if (response.statusCode >= 400) logger.warn(entry);
          else logger.debug(entry);
        });
      });
      next();
    });
  };
}
