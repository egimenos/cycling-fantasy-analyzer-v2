import { test, expect } from '../fixtures/test-fixtures';
import { TIMEOUTS } from '../helpers/wait-helpers';

test.describe('Tab Navigation State Machine', () => {
  // T034 — Tab state machine tests
  test('should show only Setup tab unlocked on fresh load', async ({ setupPage, navPage }) => {
    await setupPage.goto();

    expect(await navPage.isTabLocked('setup')).toBe(false);
    expect(await navPage.isTabLocked('dashboard')).toBe(true);
    expect(await navPage.isTabLocked('optimization')).toBe(true);
    expect(await navPage.isTabLocked('roster')).toBe(true);
  });

  test('should unlock Dashboard after successful analysis', async ({
    setupPage,
    navPage,
    validPriceList,
  }) => {
    await setupPage.goto();
    await setupPage.analyzeValidRiders(validPriceList);

    expect(await navPage.isTabLocked('setup')).toBe(false);
    expect(await navPage.isTabLocked('dashboard')).toBe(false);
    expect(await navPage.isTabActive('dashboard')).toBe(true);

    // Optimization and Roster still locked
    expect(await navPage.isTabLocked('optimization')).toBe(true);
    expect(await navPage.isTabLocked('roster')).toBe(true);
  });

  test('should unlock Optimization after clicking Get Optimal Team', async ({
    page,
    setupPage,
    dashboardPage,
    navPage,
    validPriceList,
  }) => {
    test.slow();

    await setupPage.goto();
    await setupPage.analyzeValidRiders(validPriceList);
    await dashboardPage.clickOptimize();
    await page
      .getByTestId('tab-content-optimization')
      .waitFor({ state: 'visible', timeout: TIMEOUTS.OPTIMIZATION });

    expect(await navPage.isTabLocked('optimization')).toBe(false);
  });

  test('should preserve dashboard state when navigating back and forth', async ({
    page,
    setupPage,
    dashboardPage,
    navPage,
    validPriceList,
  }) => {
    await setupPage.goto();
    await setupPage.analyzeValidRiders(validPriceList);

    // On Dashboard — select and lock riders
    await dashboardPage.selectRider('EVENEPOEL Remco');
    await dashboardPage.lockRider('POGACAR Tadej');
    await expect(dashboardPage.rosterCount).toContainText('2');

    // Navigate back to Setup
    await navPage.goToTab('setup');
    await expect(page.getByTestId('tab-content-setup')).toBeVisible({
      timeout: TIMEOUTS.UI_TRANSITION,
    });

    // Navigate forward to Dashboard again
    await navPage.goToTab('dashboard');
    await expect(page.getByTestId('tab-content-dashboard')).toBeVisible({
      timeout: TIMEOUTS.UI_TRANSITION,
    });

    // Rider table should still be visible
    await expect(dashboardPage.riderTable).toBeVisible();

    // Selections should be preserved — roster count should still be 2
    await expect(dashboardPage.rosterCount).toContainText('2');

    // Lock button should still reflect locked state
    await expect(page.getByLabel('Unlock POGACAR Tadej')).toBeVisible();
  });

  test('should re-lock downstream tabs when lock changes after optimization', async ({
    page,
    setupPage,
    dashboardPage,
    navPage,
    validPriceList,
  }) => {
    test.slow();

    await setupPage.goto();
    await setupPage.analyzeValidRiders(validPriceList);
    await dashboardPage.clickOptimize();
    await page
      .getByTestId('tab-content-optimization')
      .waitFor({ state: 'visible', timeout: TIMEOUTS.OPTIMIZATION });

    // Navigate back to Dashboard
    await navPage.goToTab('dashboard');
    await expect(page.getByTestId('tab-content-dashboard')).toBeVisible({
      timeout: TIMEOUTS.UI_TRANSITION,
    });

    // Lock a rider — triggers INVALIDATE_FROM
    await dashboardPage.lockRider('POGACAR Tadej');

    // Optimization and Roster should be re-locked
    expect(await navPage.isTabLocked('optimization')).toBe(true);
    expect(await navPage.isTabLocked('roster')).toBe(true);
  });
});
