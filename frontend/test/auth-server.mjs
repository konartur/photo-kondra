// Isolated Playwright-only backend for Next's server-rendered admin layout.
import { createServer } from 'node:http';
import { createHmac } from 'node:crypto';
const clientCounts = new Map();
createServer((request, response) => {
  response.setHeader('Content-Type', 'application/json');
  if (request.url === '/health') {
    response.end('{}');
    return;
  }
  const ip = request.headers['x-photo-client-ip'];
  const time = request.headers['x-photo-client-time'];
  const expected = createHmac('sha256', 'playwright-only-bff-secret-at-least-32-bytes')
    .update(JSON.stringify(['photo-cloud-client-v1', ip, time, request.method, request.url]))
    .digest('hex');
  if (!ip || !time || request.headers['x-photo-client-signature'] !== expected) {
    response.statusCode = 403;
    response.end(JSON.stringify({ message: 'Invalid test client proof' }));
    return;
  }
  if (request.url === '/api/v1/public/galleries/client-isolation') {
    const count = (clientCounts.get(ip) ?? 0) + 1;
    clientCounts.set(ip, count);
    response.statusCode = count > 2 ? 429 : 200;
    if (count > 2) response.setHeader('Retry-After', '30');
    response.end(
      JSON.stringify(
        count > 2 ? { message: 'Too many requests' } : { id: 'client-isolation', title: 'Test' },
      ),
    );
    return;
  }
  if (
    request.url === '/api/v1/auth/me' &&
    request.headers.authorization === 'Bearer unavailable-admin'
  ) {
    response.statusCode = 503;
    response.end(JSON.stringify({ message: 'Service is temporarily unavailable' }));
    return;
  }
  if (
    request.url === '/api/v1/auth/me' &&
    request.headers.authorization === 'Bearer throttled-admin'
  ) {
    response.statusCode = 429;
    response.setHeader('Retry-After', '30');
    response.end(
      JSON.stringify({ statusCode: 429, message: 'Too many requests; please try again later' }),
    );
    return;
  }
  if (request.url === '/api/v1/auth/login') {
    response.statusCode = 429;
    response.setHeader('Retry-After', '30');
    response.setHeader('RateLimit', 'limit=60, remaining=0, reset=30');
    response.end(
      JSON.stringify({
        statusCode: 429,
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many requests; please try again later',
      }),
    );
    return;
  }
  if (request.url === '/api/v1/auth/refresh') {
    response.statusCode = 503;
    response.setHeader('X-Request-Id', 'security-test-request');
    response.end(
      JSON.stringify({
        statusCode: 503,
        code: 'SERVICE_UNAVAILABLE',
        message: 'Service is temporarily unavailable',
      }),
    );
    return;
  }
  if (
    request.url === '/api/v1/auth/me' &&
    request.headers.authorization === 'Bearer playwright-test'
  ) {
    response.end(
      JSON.stringify({ id: 'admin', email: 'admin@integration.invalid', role: 'ADMIN' }),
    );
    return;
  }
  response.statusCode = 404;
  response.end('{}');
}).listen(3003, '127.0.0.1');
