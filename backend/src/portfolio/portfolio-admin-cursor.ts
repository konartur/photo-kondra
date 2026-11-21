import { BadRequestException } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { isUUID } from 'class-validator';

export interface PortfolioAdminCursor {
  v: 1;
  type: 'services' | 'stories';
  sortOrder: number;
  id: string;
  asOf: string;
  contentVersion: string;
}
function invalid(): never {
  throw new BadRequestException({ code: 'VALIDATION_FAILED', message: 'Invalid portfolio cursor' });
}
export function encodePortfolioAdminCursor(cursor: PortfolioAdminCursor, secret: string): string {
  const payload = Buffer.from(JSON.stringify(cursor)).toString('base64url');
  return `${payload}.${createHmac('sha256', secret).update(payload).digest('base64url')}`;
}
export function decodePortfolioAdminCursor(value: string, secret: string, type: PortfolioAdminCursor['type']): PortfolioAdminCursor {
  try {
    const [payload, signature, extra] = value.split('.');
    if (!payload || !signature || extra !== undefined || value.length > 2048 || !/^[\w-]+$/.test(signature)) return invalid();
    const expected = createHmac('sha256', secret).update(payload).digest();
    const actual = Buffer.from(signature, 'base64url');
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return invalid();
    const cursor: unknown = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!cursor || typeof cursor !== 'object' || Array.isArray(cursor)) return invalid();
    const c = cursor as Partial<PortfolioAdminCursor>;
    if (Object.keys(c).sort().join(',') !== 'asOf,contentVersion,id,sortOrder,type,v' || c.v !== 1 || c.type !== type || !Number.isSafeInteger(c.sortOrder) || typeof c.sortOrder !== 'number' || typeof c.id !== 'string' || !isUUID(c.id) || typeof c.contentVersion !== 'string' || !/^\d{1,16}$/.test(c.contentVersion) || typeof c.asOf !== 'string' || !Number.isFinite(Date.parse(c.asOf)) || new Date(c.asOf).toISOString() !== c.asOf) return invalid();
    return c as PortfolioAdminCursor;
  } catch { return invalid(); }
}
