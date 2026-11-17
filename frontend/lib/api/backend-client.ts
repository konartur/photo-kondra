import 'server-only';

import { headers } from 'next/headers';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';

export async function backendClientHeaders(
  target: string,
  method = 'GET',
): Promise<Record<string, string>> {
  const secret = process.env.BFF_TRUST_SECRET;
  const production = process.env.NODE_ENV === 'production';
  if (!secret) {
    if (production) throw new Error('Trusted BFF configuration is required');
    return {}; // Local development uses the actual loopback address at the API.
  }
  if (Buffer.byteLength(secret) < 32) throw new Error('Trusted BFF configuration is invalid');
  const incoming = await headers();
  let ip = '127.0.0.1';
  if (production) {
    const ingressKey = incoming.get('x-photo-ingress-key');
    if (
      !ingressKey ||
      !timingSafeEqual(
        createHash('sha256').update(ingressKey).digest(),
        createHash('sha256').update(secret).digest(),
      )
    )
      throw new Error('Trusted ingress is required');
    ip = incoming.get('x-photo-client-ip') ?? '';
    if (!isIP(ip)) throw new Error('Trusted client address is invalid');
  }
  const time = String(Date.now());
  const url = new URL(target);
  const signature = createHmac('sha256', secret)
    .update(
      JSON.stringify([
        'photo-cloud-client-v1',
        ip,
        time,
        method.toUpperCase(),
        url.pathname + url.search,
      ]),
    )
    .digest('hex');
  return {
    'X-Photo-Client-IP': ip,
    'X-Photo-Client-Time': time,
    'X-Photo-Client-Signature': signature,
  };
}
