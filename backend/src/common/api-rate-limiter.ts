import { HttpException } from '@nestjs/common';
import type { RequestHandler } from 'express';
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
import { rateLimitClientIp } from './bff-client-ip.js';
import type { HttpSecurityConfig } from './http-security.config.js';

export function createApiRateLimiter(config: HttpSecurityConfig): RequestHandler {
  const limiter = (limit: number) =>
    rateLimit({
      windowMs: config.windowMs,
      limit,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
      keyGenerator: (request) => ipKeyGenerator(rateLimitClientIp(request, config.bffTrustSecret)),
      // Untrusted forwarded headers are deliberately ignored by Express's trust proxy setting.
      validate: { xForwardedForHeader: false },
      handler: (_request, _response, next) =>
        next(
          new HttpException(
            {
              code: 'RATE_LIMIT_EXCEEDED',
              message: 'Too many requests; please try again later',
            },
            429,
          ),
        ),
    });
  const groups = {
    api: limiter(config.limits.api),
    auth: limiter(config.limits.auth),
    public: limiter(config.limits.public),
    archive: limiter(config.limits.archive),
  };
  return (request, response, next) => {
    const path = request.path.toLowerCase().replace(/\/+/g, '/');
    if (request.method === 'OPTIONS' || path === '/health' || path === '/health/') {
      next();
      return;
    }
    let group: keyof typeof groups = 'api';
    if (/^\/auth\/(login|refresh)\/?$/.test(path)) group = 'auth';
    else if (request.method === 'POST' && /^\/public\/galleries\/[^/]+\/archives\/?$/.test(path))
      group = 'archive';
    else if (path.startsWith('/public/')) group = 'public';
    // One counter per IP/category, independent of private tokens, IDs and query parameters.
    void groups[group](request, response, next);
  };
}
