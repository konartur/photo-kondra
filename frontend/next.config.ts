import { networkInterfaces } from 'node:os';
import type { NextConfig } from 'next';
import { PHASE_DEVELOPMENT_SERVER } from 'next/constants';

export default function nextConfig(phase: string): NextConfig {
  const config: NextConfig = {
    distDir: process.env.PHOTO_CLOUD_NEXT_DIST_DIR ?? '.next',
  };

  if (phase === PHASE_DEVELOPMENT_SERVER) {
    config.allowedDevOrigins = Object.values(networkInterfaces()).flatMap((addresses) =>
      (addresses ?? [])
        .filter(({ address, family, internal }) => family === 'IPv4' && !internal
          && /^(?:10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)/.test(address))
        .map(({ address }) => address),
    );
  }

  return config;
}
