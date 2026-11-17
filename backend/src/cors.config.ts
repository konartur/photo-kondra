import { ForbiddenException } from '@nestjs/common';
import type { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface.js';

export function createCorsOptions(allowedOrigins?: string, apiUrl?: string): CorsOptions {
  const origins = new Set(
    (allowedOrigins ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean)
      .map(parseOrigin),
  );
  // Swagger's same-origin requests may also carry an Origin header.
  if (apiUrl) origins.add(parseOrigin(apiUrl));

  return {
    origin: (origin, callback) => {
      if (origin === undefined || origins.has(origin)) {
        // Without Origin, cors emits no Access-Control-Allow-Origin but keeps Vary: Origin.
        callback(null, true);
        return;
      }
      callback(
        new ForbiddenException({
          statusCode: 403,
          code: 'CORS_ORIGIN_DENIED',
          message: 'Origin is not allowed',
        }),
        false,
      );
    },
    methods: ['GET', 'HEAD', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type'],
    exposedHeaders: ['Retry-After', 'RateLimit', 'RateLimit-Policy', 'X-Request-Id'],
    // NestJS uses explicit Bearer tokens; browser session cookies belong to Next.js.
    credentials: false,
    maxAge: 600,
    optionsSuccessStatus: 204,
  };
}

function parseOrigin(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('CORS origins must be HTTP(S) origins without paths or wildcards');
  }
  if (
    !/^https?:\/\/[^/?#\s\\]+\/?$/i.test(value) ||
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash ||
    value.includes('*')
  ) {
    throw new Error('CORS origins must be HTTP(S) origins without paths or wildcards');
  }
  return url.origin;
}
