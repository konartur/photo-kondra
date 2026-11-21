import { BadRequestException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { decodePortfolioAdminCursor, encodePortfolioAdminCursor } from './portfolio-admin-cursor.js';

describe('portfolio admin cursor', () => {
  const secret = 'unit-test-secret';
  const value = {
    v: 1 as const,
    type: 'stories' as const,
    sortOrder: 4,
    id: randomUUID(),
    asOf: '2026-11-21T12:00:00.000Z',
    contentVersion: '12',
  };

  it('round trips the signed resource context', () => {
    const cursor = encodePortfolioAdminCursor(value, secret);
    expect(decodePortfolioAdminCursor(cursor, secret, 'stories')).toEqual(value);
  });

  it('rejects a cursor signed for another resource or tampered payload', () => {
    const cursor = encodePortfolioAdminCursor(value, secret);
    expect(() => decodePortfolioAdminCursor(cursor, secret, 'services')).toThrow(BadRequestException);
    const [payload, signature] = cursor.split('.');
    const altered = `${Buffer.from(`${payload}x`).toString('base64url')}.${signature}`;
    expect(() => decodePortfolioAdminCursor(altered, secret, 'stories')).toThrow(BadRequestException);
  });
});
