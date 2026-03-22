import { test as base } from '@playwright/test';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { NavPage } from '../pages/nav.page';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
import { SetupPage } from '../pages/setup.page';
import { DashboardPage } from '../pages/dashboard.page';
import { OptimizationPage } from '../pages/optimization.page';
import { RosterPage } from '../pages/roster.page';

interface E2EFixtures {
  navPage: NavPage;
  setupPage: SetupPage;
  dashboardPage: DashboardPage;
  optimizationPage: OptimizationPage;
  rosterPage: RosterPage;
  validPriceList: string;
  invalidPriceList: string;
  partialMatchList: string;
}

export const test = base.extend<E2EFixtures>({
  navPage: async ({ page }, use) => {
    await use(new NavPage(page));
  },
  setupPage: async ({ page }, use) => {
    await use(new SetupPage(page));
  },
  dashboardPage: async ({ page }, use) => {
    await use(new DashboardPage(page));
  },
  optimizationPage: async ({ page }, use) => {
    await use(new OptimizationPage(page));
  },
  rosterPage: async ({ page }, use) => {
    await use(new RosterPage(page));
  },
  // eslint-disable-next-line no-empty-pattern
  validPriceList: async ({}, use) => {
    const content = readFileSync(join(__dirname, 'valid-price-list.txt'), 'utf-8');
    await use(content);
  },
  // eslint-disable-next-line no-empty-pattern
  invalidPriceList: async ({}, use) => {
    const content = readFileSync(join(__dirname, 'invalid-price-list.txt'), 'utf-8');
    await use(content);
  },
  // eslint-disable-next-line no-empty-pattern
  partialMatchList: async ({}, use) => {
    const content = readFileSync(join(__dirname, 'partial-match-list.txt'), 'utf-8');
    await use(content);
  },
});

export { expect } from '@playwright/test';
