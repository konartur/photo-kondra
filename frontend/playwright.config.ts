import { defineConfig } from '@playwright/test';

const portfolioDb = process.env.PHOTO_CLOUD_PORTFOLIO_DB_E2E === '1';

export default defineConfig({
  testDir: './test',
  ...(portfolioDb ? { testMatch: '**/portfolio-db.spec.ts' } : { testIgnore: '**/portfolio-db.spec.ts' }),
  workers: 1,
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
    {
      name: 'webkit',
      testMatch: portfolioDb ? '**/portfolio-db.spec.ts' : '**/portfolio-*.spec.ts',
      use: { browserName: 'webkit' },
    },
  ],
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
        PHOTO_CLOUD_NEXT_DIST_DIR: process.env.PHOTO_CLOUD_E2E_DIST_DIR ?? (portfolioDb ? '.next-e2e-db' : '.next-e2e'),
        PORTFOLIO_CONTENT_MODE: portfolioDb ? 'DB' : 'FILE',
        ...(portfolioDb ? { APP_URL: 'https://portfolio.example' } : {}),
        API_URL: 'http://127.0.0.1:3003',
        BFF_TRUST_SECRET: 'playwright-only-bff-secret-at-least-32-bytes',
      },
      reuseExistingServer: false,
      timeout: 120000,
    },
  ],
});
