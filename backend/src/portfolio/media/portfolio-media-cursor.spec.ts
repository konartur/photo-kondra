import { describe, expect, it } from '@jest/globals';
import { decodeMediaCursor, encodeMediaCursor } from './portfolio-media-cursor.js';
import type { PortfolioMediaCursor } from './portfolio-media-cursor.js';

const cursor: PortfolioMediaCursor = {
  v: 1,
  ownerId: 'owner-id',
  limit: 24,
  contentVersion: '2',
  asOf: '2026-11-21T10:00:00.000Z',
  createdAt: '2026-11-20T10:00:00.000Z',
  id: '12345678-1234-4234-8234-123456789012',
};
describe('Portfolio media cursor context', () => {
  it('round-trips authenticated cursor fields without accepting a different owner or limit', () => {
    const value = encodeMediaCursor(cursor, 'synthetic-secret');
    expect(decodeMediaCursor(value, 'synthetic-secret', 'owner-id', 24)).toEqual(cursor);
    expect(() => decodeMediaCursor(value, 'synthetic-secret', 'other-id', 24)).toThrow();
    expect(() => decodeMediaCursor(value, 'synthetic-secret', 'owner-id', 50)).toThrow();
    expect(() => decodeMediaCursor(`${value}x`, 'synthetic-secret', 'owner-id', 24)).toThrow();
  });
});
