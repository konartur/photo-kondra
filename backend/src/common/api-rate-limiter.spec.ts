import { describe, expect, it } from '@jest/globals';
import { HttpException } from '@nestjs/common';
import type { Request, Response } from 'express';
import { EventEmitter } from 'node:events';
import { createHmac } from 'node:crypto';
import { createApiRateLimiter } from './api-rate-limiter.js';
import { createHttpSecurityConfig } from './http-security.config.js';

function client(windowMs = 60000, bffTrustSecret?: string) {
  const config = createHttpSecurityConfig({});
  const options = {
    ...config,
    bffTrustSecret,
    windowMs,
    limits: { auth: 2, public: 2, archive: 1, api: 3 },
  };
  const middleware = createApiRateLimiter(options);
  return async (
    path: string,
    method = 'GET',
    ip = '192.0.2.1',
    incoming: Record<string, string> = {},
  ) => {
    const headers = new Map<string, string>();
    const request = {
      path,
      method,
      ip,
      originalUrl: `/api/v1${path}`,
      headers: incoming,
      get: (name: string) => incoming[name.toLowerCase()],
      app: { get: () => false },
      socket: { remoteAddress: ip },
    } as unknown as Request;
    const response = Object.assign(new EventEmitter(), {
      headersSent: false,
      statusCode: 200,
      setHeader: (name: string, value: string) => headers.set(name.toLowerCase(), String(value)),
      getHeader: (name: string) => headers.get(name.toLowerCase()),
    }) as unknown as Response;
    const error = await new Promise<unknown>((resolve) => middleware(request, response, resolve));
    return { error, headers };
  };
}

describe('API rate limiter', () => {
  it('isolates two signed browser IPs arriving through the same BFF address', async () => {
    const secret = 'test-only-bff-secret-at-least-32-characters';
    const run = client(60000, secret);
    const proof = (ip: string) => {
      const time = String(Date.now());
      return {
        'x-photo-client-ip': ip,
        'x-photo-client-time': time,
        'x-photo-client-signature': createHmac('sha256', secret)
          .update(JSON.stringify(['photo-cloud-client-v1', ip, time, 'POST', '/api/v1/auth/login']))
          .digest('hex'),
      };
    };
    await run('/auth/login', 'POST', '127.0.0.1', proof('192.0.2.1'));
    await run('/auth/login', 'POST', '127.0.0.1', proof('192.0.2.1'));
    expect(
      (await run('/auth/login', 'POST', '127.0.0.1', proof('192.0.2.2'))).error,
    ).toBeUndefined();
    expect(
      (await run('/auth/login', 'POST', '127.0.0.1', proof('192.0.2.1'))).error,
    ).toBeInstanceOf(HttpException);
  });
  it('shares auth counters across login and refresh and provides a retry delay', async () => {
    const run = client();
    expect((await run('/auth/login', 'POST')).error).toBeUndefined();
    expect((await run('/auth/refresh', 'POST')).error).toBeUndefined();
    const blocked = await run('/auth/login', 'POST');
    expect(blocked.error).toBeInstanceOf(HttpException);
    expect((blocked.error as HttpException).getStatus()).toBe(429);
    expect(Number(blocked.headers.get('retry-after'))).toBeGreaterThan(0);
    expect(blocked.headers.get('ratelimit')).toBeDefined();
  });
  it('does not reset a public quota by changing gallery tokens and keeps archive generation separate', async () => {
    const run = client();
    await run('/public/galleries/token1');
    await run('/public/galleries/token2');
    expect((await run('/public/galleries/token3')).error).toBeInstanceOf(HttpException);
    expect((await run('/public/galleries/token1/archives', 'POST')).error).toBeUndefined();
    expect((await run('/public/galleries/token2/archives', 'POST')).error).toBeInstanceOf(
      HttpException,
    );
    expect((await run('/photos/id', 'PATCH')).error).toBeUndefined();
  });
  it('leaves health/preflight requests exempt and isolates client IPv4 addresses', async () => {
    const run = client();
    for (let i = 0; i < 4; i++) {
      expect((await run('/auth/login', 'OPTIONS')).error).toBeUndefined();
      expect((await run('/health')).error).toBeUndefined();
    }
    await run('/auth/login', 'POST');
    await run('/auth/login', 'POST');
    expect((await run('/auth/login', 'POST', '192.0.2.2')).error).toBeUndefined();
  });
  it('groups IPv6 subnet addresses to prevent simple address rotation bypass', async () => {
    const run = client();
    await run('/auth/login', 'POST', '2001:db8::1');
    await run('/auth/login', 'POST', '2001:db8::2');
    expect((await run('/auth/login', 'POST', '2001:db8::3')).error).toBeInstanceOf(HttpException);
  });
  it('allows requests again after the counter window expires', async () => {
    const run = client(30);
    await run('/auth/login', 'POST');
    await run('/auth/login', 'POST');
    expect((await run('/auth/login', 'POST')).error).toBeInstanceOf(HttpException);
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect((await run('/auth/login', 'POST')).error).toBeUndefined();
  });
});
