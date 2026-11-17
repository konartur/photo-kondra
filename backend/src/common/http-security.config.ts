import { isIP } from 'node:net';

export interface HttpSecurityConfig {
  bodyLimit: number;
  windowMs: number;
  limits: { auth: number; public: number; archive: number; api: number };
  trustedProxies: string[];
  bffTrustSecret?: string;
}

export function createHttpSecurityConfig(env: NodeJS.ProcessEnv = process.env): HttpSecurityConfig {
  const bffTrustSecret = env.BFF_TRUST_SECRET || undefined;
  if (
    (bffTrustSecret !== undefined && Buffer.byteLength(bffTrustSecret) < 32) ||
    (env.NODE_ENV === 'production' && !bffTrustSecret)
  )
    throw new Error(
      'BFF_TRUST_SECRET must contain at least 32 bytes and is required in production',
    );
  const integer = (key: string, fallback: number, maximum = 2147483647) => {
    const value = Number(env[key] ?? fallback);
    if (!Number.isSafeInteger(value) || value < 1 || value > maximum)
      throw new Error(`${key} must be a positive integer no greater than ${maximum}`);
    return value;
  };
  const trustedProxies = (env.TRUSTED_PROXY_CIDRS ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  for (const entry of trustedProxies) {
    const [address, prefix, extra] = entry.split('/');
    const version = isIP(address!);
    if (
      !version ||
      extra !== undefined ||
      (prefix !== undefined &&
        (!/^\d+$/.test(prefix) ||
          Number(prefix) < 1 ||
          Number(prefix) > (version === 4 ? 32 : 128)))
    )
      throw new Error('TRUSTED_PROXY_CIDRS must contain explicit IP addresses or CIDRs');
  }
  return {
    bodyLimit: integer('HTTP_BODY_LIMIT_BYTES', 65536),
    windowMs: integer('RATE_LIMIT_WINDOW_MS', 60000),
    limits: {
      auth: integer('RATE_LIMIT_AUTH', 60),
      public: integer('RATE_LIMIT_PUBLIC', 600),
      archive: integer('RATE_LIMIT_ARCHIVE', 10),
      api: integer('RATE_LIMIT_API', 1200),
    },
    trustedProxies,
    bffTrustSecret,
  };
}
