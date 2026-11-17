import { describe, expect, it } from '@jest/globals';
import type { Request } from 'express';
import { createHmac } from 'node:crypto';
import { rateLimitClientIp } from './bff-client-ip.js';

const secret = 'test-only-bff-secret-at-least-32-characters';
function signed(overrides: Record<string, string | undefined> = {}, age = 0): Request {
  const ip = '192.0.2.1',
    time = String(Date.now() - age);
  const incoming: Record<string, string | undefined> = {
    'x-photo-client-ip': ip,
    'x-photo-client-time': time,
    'x-photo-client-signature': createHmac('sha256', secret)
      .update(JSON.stringify(['photo-cloud-client-v1', ip, time, 'POST', '/api/v1/auth/login']))
      .digest('hex'),
    ...overrides,
  };
  return {
    method: 'POST',
    originalUrl: '/api/v1/auth/login',
    ip: '127.0.0.1',
    get: (name: string) => incoming[name.toLowerCase()],
  } as unknown as Request;
}
describe('BFF client proof', () => {
  it('accepts a recent authenticated client address', () => {
    expect(rateLimitClientIp(signed(), secret)).toBe('192.0.2.1');
  });
  it.each([
    { 'x-photo-client-ip': '192.0.2.2' },
    { 'x-photo-client-ip': 'not-an-ip' },
    { 'x-photo-client-signature': 'bad' },
    { 'x-photo-client-time': '0' },
  ])('rejects forged or malformed proof headers', (overrides) => {
    expect(() => rateLimitClientIp(signed(overrides), secret)).toThrow('Invalid client proof');
  });
  it('rejects expired proofs and replay on another path or HTTP method', () => {
    expect(() => rateLimitClientIp(signed({}, 60000), secret)).toThrow();
    const pathReplay = signed();
    pathReplay.originalUrl = '/api/v1/public/galleries/token';
    expect(() => rateLimitClientIp(pathReplay, secret)).toThrow();
    const methodReplay = signed();
    methodReplay.method = 'GET';
    expect(() => rateLimitClientIp(methodReplay, secret)).toThrow();
    expect(() => rateLimitClientIp(signed())).toThrow();
  });
});
