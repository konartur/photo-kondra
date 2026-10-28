import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './test',
  workers: 1,
  use: { baseURL: 'http://localhost:3002', trace: 'retain-on-failure' },
  webServer: [
    {
      command: 'node test/auth-server.mjs',
      url: 'http://127.0.0.1:3003/health',
      reuseExistingServer: false,
    },
    {
      command: 'npm run build -- --webpack && npx next start --port 3002',
      url: 'http://localhost:3002',
      env: { PHOTO_CLOUD_NEXT_DIST_DIR: '.next-e2e', API_URL: 'http://127.0.0.1:3003' },
      reuseExistingServer: false,
      timeout: 120000,
    },
  ],
});
