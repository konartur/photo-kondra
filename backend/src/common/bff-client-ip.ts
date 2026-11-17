import { ForbiddenException } from '@nestjs/common';
import type { Request } from 'express';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';

export function rateLimitClientIp(request: Request, secret?: string): string {
  const ip = request.get('x-photo-client-ip');
  const time = request.get('x-photo-client-time');
  const signature = request.get('x-photo-client-signature');
  if (ip === undefined && time === undefined && signature === undefined)
    return request.ip ?? request.socket.remoteAddress ?? 'unknown';

  const denied = () =>
    new ForbiddenException({ code: 'INVALID_CLIENT_PROOF', message: 'Invalid client proof' });
  if (
    !secret ||
    !ip ||
    !isIP(ip) ||
    !time ||
    !/^\d{13}$/.test(time) ||
    Math.abs(Date.now() - Number(time)) > 30000 ||
    !signature ||
    !/^[a-f0-9]{64}$/.test(signature)
  )
    throw denied();

  const expected = createHmac('sha256', secret)
    .update(
      JSON.stringify(['photo-cloud-client-v1', ip, time, request.method, request.originalUrl]),
    )
    .digest();
  if (!timingSafeEqual(expected, Buffer.from(signature, 'hex'))) throw denied();
  return ip;
}
