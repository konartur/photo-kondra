import { describe, expect, it } from '@jest/globals';
import { createHttpSecurityConfig } from './http-security.config.js';

describe('HTTP security configuration', () => {
  it('requires a strong shared BFF key in production', () => {
    expect(() => createHttpSecurityConfig({ NODE_ENV: 'production' })).toThrow('BFF_TRUST_SECRET');
    expect(() => createHttpSecurityConfig({ BFF_TRUST_SECRET: 'weak' })).toThrow(
      'BFF_TRUST_SECRET',
    );
    expect(
      createHttpSecurityConfig({
        NODE_ENV: 'production',
        BFF_TRUST_SECRET: 'test-only-secret-at-least-32-bytes',
      }).bffTrustSecret,
    ).toBeDefined();
  });
  it.each(['0', '-1', 'NaN', 'Infinity', '1.5', '2147483648'])(
    'rejects invalid limits: %s',
    (value) => {
      expect(() => createHttpSecurityConfig({ RATE_LIMIT_WINDOW_MS: value })).toThrow();
      expect(() => createHttpSecurityConfig({ HTTP_BODY_LIMIT_BYTES: value })).toThrow();
    },
  );
  it.each(['true', '*', '1', '0.0.0.0/0', '::/0', '127.0.0.1/33', '::1/129', 'bad'])(
    'rejects unsafe trusted proxy values: %s',
    (value) => {
      expect(() => createHttpSecurityConfig({ TRUSTED_PROXY_CIDRS: value })).toThrow();
    },
  );
  it('accepts explicit IPv4 and IPv6 proxy networks', () => {
    expect(
      createHttpSecurityConfig({ TRUSTED_PROXY_CIDRS: '127.0.0.1, ::1/128, 10.0.0.0/24' })
        .trustedProxies,
    ).toEqual(['127.0.0.1', '::1/128', '10.0.0.0/24']);
  });
});
