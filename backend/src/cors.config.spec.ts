import { describe, expect, it } from '@jest/globals';
import { createCorsOptions } from './cors.config.js';

describe('CORS configuration', () => {
  it.each([
    '*',
    'https://*.example.com',
    'null',
    'file:///tmp',
    'https://example.com/path',
    'https://example.com/path/..',
    'https:example.com',
    'https://user:password@example.com',
    'https://example.com?query=1',
    'https://example.com#fragment',
  ])('rejects unsafe or malformed origin configuration: %s', (value) => {
    expect(() => createCorsOptions(value)).toThrow('CORS origins must be HTTP(S) origins');
  });

  it('validates API_URL rather than reflecting arbitrary origins for Swagger', () => {
    expect(() => createCorsOptions('https://photos.example.com', '*')).toThrow();
  });
});
