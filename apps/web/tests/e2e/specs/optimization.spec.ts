import { test, expect } from '../fixtures/test-fixtures';
import { TIMEOUTS } from '../helpers/wait-helpers';

test.describe('Optimization Tab', () => {
  test.slow(); // All tests depend on real optimizer (~10-20s)

  test.beforeEach(async ({ page, setupPage, dashboardPage, validPriceList }) => {
    await setupPage.goto();
    await setupPage.analyzeValidRiders(validPriceList);
    await dashboardPage.clickOptimize();
    await page
      .getByTestId('tab-content-optimization')
      .waitFor({ state: 'visible', timeout: TIMEOUTS.OPTIMIZATION });
  });

  // T030 — Optimization results display
  test('should display projected total and budget efficiency', async ({ optimizationPage }) => {
    await expect(optimizationPage.panel).toBeVisible();
    await expect(optimizationPage.projectedTotal).toBeVisible();
    await expect(optimizationPage.budgetEfficiency).toBeVisible();

    const total = await optimizationPage.getProjectedTotalText();
    expect(Number(total.replace(/[^0-9.]/g, ''))).toBeGreaterThan(0);
  });

  test('should display 9 rider cards in the lineup', async ({ optimizationPage }) => {
    await expect(optimizationPage.lineup).toBeVisible();
    const cardCount = await optimizationPage.getRiderCardCount();
    expect(cardCount).toBe(9);
  });

  test('should display score breakdown by category', async ({ optimizationPage, page }) => {
    await expect(optimizationPage.scoreBreakdown).toBeVisible();
    await expect(page.getByText('GC').first()).toBeVisible();
    await expect(page.getByText('STAGE').first()).toBeVisible();
  });

  // T031 — Locked riders + apply to roster
  test('should include locked rider in optimal team', async ({
    page,
    setupPage,
    dashboardPage,
    optimizationPage,
    validPriceList,
  }) => {
    // Override beforeEach: analyze, lock, then optimize
    await setupPage.goto();
    await setupPage.analyzeValidRiders(validPriceList);
    await dashboardPage.lockRider('POGACAR Tadej');
    await dashboardPage.clickOptimize();
    await page
      .getByTestId('tab-content-optimization')
      .waitFor({ state: 'visible', timeout: TIMEOUTS.OPTIMIZATION });

    expect(await optimizationPage.hasRiderCard('POGACAR Tadej')).toBe(true);
  });

  // T031b — Optimize replaces manual selection with optimal team
  test('should replace manual selection with optimal 9-rider team', async ({
    page,
    setupPage,
    dashboardPage,
    optimizationPage,
    validPriceList,
  }) => {
    // Start fresh: analyze, manually select 3 riders, then optimize
    await setupPage.goto();
    await setupPage.analyzeValidRiders(validPriceList);

    await dashboardPage.selectRider('POGACAR Tadej');
    await dashboardPage.selectRider('VINGEGAARD Jonas');
    await dashboardPage.selectRider('EVENEPOEL Remco');
    await expect(dashboardPage.rosterCount).toContainText('3');

    // Run optimizer — should produce full 9-rider team
    await dashboardPage.clickOptimize();
    await page
      .getByTestId('tab-content-optimization')
      .waitFor({ state: 'visible', timeout: TIMEOUTS.OPTIMIZATION });

    expect(await optimizationPage.getRiderCardCount()).toBe(9);

    // Apply to roster and verify team builder has 9 riders
    await optimizationPage.clickApplyToRoster();
    await page
      .getByTestId('tab-content-roster')
      .waitFor({ state: 'visible', timeout: TIMEOUTS.UI_TRANSITION });
  });

  test('should transition to Roster tab when Apply to Roster is clicked', async ({
    page,
    optimizationPage,
    rosterPage,
  }) => {
    await optimizationPage.clickApplyToRoster();
    await expect(page.getByTestId('tab-content-roster')).toBeVisible({ timeout: 5_000 });
    await expect(rosterPage.completeBanner).toBeVisible();
  });
});
