import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './test',
  workers: 1,
  use: {
    baseURL: 'http://localhost:3002',
    trace: 'retain-on-failure',
    extraHTTPHeaders: {
      'X-Photo-Ingress-Key': 'playwright-only-bff-secret-at-least-32-bytes',
      'X-Photo-Client-IP': '192.0.2.1',
    },
  },
  webServer: [
    {
      command: 'node test/auth-server.mjs',
      url: 'http://127.0.0.1:3003/health',
      reuseExistingServer: false,
    },
    {
      command: 'npm run build -- --webpack && npx next start --port 3002',
      url: 'http://localhost:3002',
      env: {
        PHOTO_CLOUD_NEXT_DIST_DIR: process.env.PHOTO_CLOUD_E2E_DIST_DIR ?? '.next-e2e',
        API_URL: 'http://127.0.0.1:3003',
        BFF_TRUST_SECRET: 'playwright-only-bff-secret-at-least-32-bytes',
      },
      reuseExistingServer: false,
      timeout: 120000,
    },
  ],
});
