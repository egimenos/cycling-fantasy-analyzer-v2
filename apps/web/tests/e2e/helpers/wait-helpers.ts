import type { Page } from '@playwright/test';

export const TIMEOUTS = {
  API_RESPONSE: 30_000,
  OPTIMIZATION: 30_000,
  EXTERNAL_SERVICE: 30_000,
  UI_TRANSITION: 5_000,
  QUICK: 2_000,
} as const;

export async function waitForTabContent(page: Page, tab: string): Promise<void> {
  await page
    .getByTestId(`tab-content-${tab}`)
    .waitFor({ state: 'visible', timeout: TIMEOUTS.UI_TRANSITION });
}
