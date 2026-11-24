import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './test',
  testMatch: 'portfolio-editor-unit.spec.ts',
  workers: 1,
});
