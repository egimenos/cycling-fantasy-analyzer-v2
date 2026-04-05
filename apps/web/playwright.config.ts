import { defineConfig } from '@playwright/test';

const isCI = !!process.env.CI;

export default defineConfig({
  testDir: './tests/e2e/specs',
  testIgnore: ['**/demo-video.spec.ts'],
  timeout: isCI ? 30_000 : 60_000,
  retries: isCI ? 1 : 1,
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
