/**
 * Demo Video Script
 *
 * Run headed with slow-mo so you can screen-record with OBS / ShareX:
 *
 *   cd apps/web
 *   npx playwright test tests/e2e/demo-video.spec.ts --headed --project=chromium
 *
 * The script also saves a Playwright-native video in ./test-results/.
 * Tweak PAUSE_MS to speed up / slow down between actions.
 */
import { test, expect } from '@playwright/test';

const PAUSE_MS = 1200; // ms between visible actions
const LONG_PAUSE_MS = 2500; // ms for "let the viewer read" moments

const wait = (ms = PAUSE_MS) => new Promise((r) => setTimeout(r, ms));

test.use({
  headless: false,
  viewport: { width: 1920, height: 1080 },
  launchOptions: { slowMo: 80 },
  video: { mode: 'on', size: { width: 1920, height: 1080 } },
  deviceScaleFactor: 2,
});

test('Full app demo – all features', async ({ page }) => {
  test.setTimeout(180_000);

  // ─── SETUP TAB ───────────────────────────────────────────────
  await page.goto('/?tab=setup');
  await wait(LONG_PAUSE_MS);

  // Race URL – auto-detect
  const raceInput = page.getByTestId('setup-race-url-input');
  await raceInput.click();
  await raceInput.fill('https://www.procyclingstats.com/race/tour-de-france/2025/startlist');
  await wait(LONG_PAUSE_MS);

  // Wait for race profile card to appear
  await expect(page.getByText('Tour De France')).toBeVisible({ timeout: 10_000 });
  await wait(LONG_PAUSE_MS);

  // Import price list
  const gameInput = page.getByTestId('setup-game-url-input');
  await gameInput.click();
  await gameInput.fill('https://grandesminivueltas.com/index.php/2025/07/02/tour-de-france-2025/');
  await wait();

  await page.getByTestId('setup-fetch-btn').click();
  await wait();

  // Wait for riders to populate (look for "valid" count)
  await expect(page.getByText(/\d+ valid/)).toBeVisible({ timeout: 30_000 });
  await wait(LONG_PAUSE_MS);

  // Budget field – show it's editable
  const budget = page.getByTestId('setup-budget-input');
  await budget.click();
  await wait();

  // Analyze
  await page.getByTestId('setup-analyze-btn').click();
  await wait();

  // Wait for dashboard to load
  await expect(page).toHaveURL(/tab=dashboard/, { timeout: 60_000 });
  await wait(LONG_PAUSE_MS);

  // ─── DASHBOARD TAB ──────────────────────────────────────────
  // Let the table render
  await expect(page.getByText(/Showing \d+ of \d+/)).toBeVisible({
    timeout: 15_000,
  });
  await wait(LONG_PAUSE_MS);

  // Scroll down slowly through the table
  for (let i = 0; i < 3; i++) {
    await page.evaluate(() => window.scrollBy({ top: 300, behavior: 'smooth' }));
    await wait();
  }
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
  await wait();

  // Expand rider detail – click on first rider row
  const firstRow = page
    .getByRole('button')
    .filter({ hasText: /VINGEGAARD Jonas/ })
    .first();
  await firstRow.click();
  await wait(LONG_PAUSE_MS);

  // Switch to Breakout sub-tab if visible
  const breakoutTab = page.getByRole('button', { name: 'Breakout', exact: true });
  if (await breakoutTab.isVisible()) {
    await breakoutTab.click();
    await wait(LONG_PAUSE_MS);
  }

  // Collapse
  await firstRow.click();
  await wait();

  // Lock Pogačar
  await page.getByRole('button', { name: 'Lock POGAČAR Tadej', exact: true }).click();
  await wait(LONG_PAUSE_MS);

  // Select a few riders manually
  for (const name of ['VINGEGAARD Jonas', 'EVENEPOEL Remco', 'ROGLIČ Primož']) {
    await page.getByRole('checkbox', { name: new RegExp(`Select ${name}`) }).click();
    await wait();
  }
  await wait(LONG_PAUSE_MS);

  // Show filter tabs
  for (const filter of ['Breakout', 'Value Picks', 'All']) {
    const btn = page
      .getByRole('button')
      .filter({ hasText: new RegExp(`^${filter}`) })
      .first();
    if (await btn.isVisible()) {
      await btn.click();
      await wait();
    }
  }
  await wait();

  // Toggle dark mode
  await page.getByRole('button', { name: /dark mode|light mode/i }).click();
  await wait(LONG_PAUSE_MS);

  // Scroll down to show team builder panel
  await page.evaluate(() => window.scrollBy({ top: 500, behavior: 'smooth' }));
  await wait(LONG_PAUSE_MS);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
  await wait();

  // Optimize
  await page.getByTestId('dashboard-optimize-btn').click();
  await wait();

  // ─── OPTIMIZATION TAB ───────────────────────────────────────
  await expect(page).toHaveURL(/tab=optimization/, { timeout: 30_000 });
  await expect(page.getByText('OPTIMAL CONFIGURATION')).toBeVisible({
    timeout: 15_000,
  });
  await wait(LONG_PAUSE_MS);

  // Slow scroll to see full lineup + distribution chart
  for (let i = 0; i < 3; i++) {
    await page.evaluate(() => window.scrollBy({ top: 350, behavior: 'smooth' }));
    await wait();
  }

  // Hover a couple of rider cards for tooltips
  const riderCards = page.locator('[data-testid="optimization-rider-card"]');
  const cardCount = await riderCards.count();
  for (let i = 0; i < Math.min(3, cardCount); i++) {
    await riderCards.nth(i).hover();
    await wait();
  }

  // Expand first alternative team
  const altTeam = page.getByRole('button').filter({ hasText: /Alternative Team #1/ });
  if (await altTeam.isVisible()) {
    await altTeam.click();
    await wait(LONG_PAUSE_MS);
    // Collapse it
    await altTeam.click();
    await wait();
  }

  // Scroll back up and apply to roster
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
  await wait();
  await page.getByTestId('optimization-apply-btn').click();
  await wait();

  // ─── ROSTER TAB ─────────────────────────────────────────────
  await expect(page).toHaveURL(/tab=roster/, { timeout: 15_000 });
  await expect(page.getByText('Team Complete!')).toBeVisible({
    timeout: 10_000,
  });
  await wait(LONG_PAUSE_MS);

  // Scroll through the full roster
  for (let i = 0; i < 3; i++) {
    await page.evaluate(() => window.scrollBy({ top: 300, behavior: 'smooth' }));
    await wait();
  }
  await wait(LONG_PAUSE_MS);

  // Toggle back to light mode
  await page.getByRole('button', { name: /dark mode|light mode/i }).click();
  await wait(LONG_PAUSE_MS);

  // Scroll back up
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
  await wait();

  // Copy to clipboard
  await page.getByTestId('roster-copy-btn').click();
  await wait(LONG_PAUSE_MS);

  // Final pause to let viewer see the result
  await wait(LONG_PAUSE_MS);
});
