import { BadRequestException } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { isUUID } from 'class-validator';

export interface PortfolioMediaCursor {
  v: 1;
  ownerId: string;
  limit: number;
  search?: string;
  contentVersion: string;
  asOf: string;
  createdAt: string;
  id: string;
}
export function encodeMediaCursor(cursor: PortfolioMediaCursor, secret: string): string {
  const payload = Buffer.from(JSON.stringify(cursor)).toString('base64url');
  return `${payload}.${createHmac('sha256', secret).update(payload).digest('base64url')}`;
}
export function decodeMediaCursor(
  value: string,
  secret: string,
  ownerId: string,
  limit: number,
  search = '',
): PortfolioMediaCursor {
  const invalid = () =>
    new BadRequestException({
      code: 'VALIDATION_FAILED',
      message: 'Invalid portfolio media cursor',
    });
  try {
    const [payload, signature, extra] = value.split('.');
    if (
      !payload ||
      !signature ||
      extra !== undefined ||
      value.length > 2048 ||
      !/^[\w-]+$/.test(signature)
    )
      throw invalid();
    const expected = createHmac('sha256', secret).update(payload).digest();
    const actual = Buffer.from(signature, 'base64url');
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw invalid();
    const parsed: unknown = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw invalid();
    const cursor = parsed as Partial<PortfolioMediaCursor>;
    const date = (text: unknown): text is string =>
      typeof text === 'string' &&
      Number.isFinite(Date.parse(text)) &&
      new Date(text).toISOString() === text;
    if (
      Object.keys(cursor).sort().join(',') !== (search ? 'asOf,contentVersion,createdAt,id,limit,ownerId,search,v' : 'asOf,contentVersion,createdAt,id,limit,ownerId,v') ||
      cursor.v !== 1 ||
      cursor.ownerId !== ownerId ||
      cursor.limit !== limit ||
      (cursor.search ?? '') !== search ||
      typeof cursor.contentVersion !== 'string' ||
      !/^\d{1,16}$/.test(cursor.contentVersion) ||
      !date(cursor.asOf) ||
      !date(cursor.createdAt) ||
      cursor.createdAt > cursor.asOf ||
      typeof cursor.id !== 'string' ||
      !isUUID(cursor.id)
    )
      throw invalid();
    return cursor as PortfolioMediaCursor;
  } catch {
    throw invalid();
  }
}
