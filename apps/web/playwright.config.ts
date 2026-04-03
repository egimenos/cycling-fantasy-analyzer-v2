import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e/specs',
  testIgnore: ['**/demo-video.spec.ts'],
  timeout: 60_000,
  retries: 1,
  use: {
    baseURL: 'http://localhost:3000',
    headless: true,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'pnpm dev',
    port: 3000,
    timeout: 30_000,
    reuseExistingServer: true,
  },
});
