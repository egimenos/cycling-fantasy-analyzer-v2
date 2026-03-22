import { test, expect } from '../fixtures/test-fixtures';
import { TIMEOUTS } from '../helpers/wait-helpers';

test.describe('Roster Tab', () => {
  test.slow(); // Full flow required: analyze + optimize + apply

  test.beforeEach(async ({ page, setupPage, dashboardPage, optimizationPage, validPriceList }) => {
    await setupPage.goto();
    await setupPage.analyzeValidRiders(validPriceList);
    await dashboardPage.clickOptimize();
    await page
      .getByTestId('tab-content-optimization')
      .waitFor({ state: 'visible', timeout: TIMEOUTS.OPTIMIZATION });
    await optimizationPage.clickApplyToRoster();
    await page
      .getByTestId('tab-content-roster')
      .waitFor({ state: 'visible', timeout: TIMEOUTS.UI_TRANSITION });
  });

  // T032 — Roster display and metrics
  test('should display 9 riders in the official roster', async ({ rosterPage }) => {
    const riderCount = await rosterPage.getRiderCount();
    expect(riderCount).toBe(9);
  });

  test('should show captain badge on first rider', async ({ rosterPage }) => {
    await expect(rosterPage.captainBadge).toBeVisible();
    await expect(rosterPage.captainBadge).toContainText('CAPTAIN');
  });

  test('should display all metrics in sidebar', async ({ rosterPage }) => {
    await expect(rosterPage.totalScore).toBeVisible();
    await expect(rosterPage.totalCost).toBeVisible();
    await expect(rosterPage.remaining).toBeVisible();
    await expect(rosterPage.avgRider).toBeVisible();

    const score = await rosterPage.getTotalScoreText();
    expect(Number(score.replace(/[^0-9.]/g, ''))).toBeGreaterThan(0);
  });

  test('should display success banner', async ({ rosterPage }) => {
    await expect(rosterPage.completeBanner).toBeVisible();
    await expect(rosterPage.completeBanner).toContainText('Team Complete');
  });

  // T033 — Copy to clipboard + reset
  test('should change button text to Copied on click', async ({ rosterPage, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await rosterPage.clickCopy();
    await expect(rosterPage.copyBtn).toContainText(/copied/i);
  });

  test('should reset to Setup tab when Reset is clicked', async ({ page, rosterPage, navPage }) => {
    await rosterPage.clickReset();

    // Roster tab should disappear
    await expect(page.getByTestId('tab-content-roster')).not.toBeVisible({ timeout: 15_000 });

    // Optimization and Roster tabs should be locked after reset
    expect(await navPage.isTabLocked('optimization')).toBe(true);
    expect(await navPage.isTabLocked('roster')).toBe(true);
  });
});
