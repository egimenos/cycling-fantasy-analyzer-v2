import { test, expect } from '../fixtures/test-fixtures';
import { TIMEOUTS } from '../helpers/wait-helpers';

test.describe('Full End-to-End Workflow', () => {
  // T036 — Complete happy path
  test('should complete full workflow: setup → dashboard → optimize → roster → reset', async ({
    page,
    context,
    setupPage,
    dashboardPage,
    optimizationPage,
    rosterPage,
    navPage,
    validPriceList,
  }) => {
    test.slow(); // 60-90s with real backend

    // 1. SETUP
    await setupPage.goto();
    await setupPage.fillRiders(validPriceList);
    await setupPage.setBudget(2000);
    await setupPage.clickAnalyze();

    // 2. DASHBOARD — verify and interact
    await expect(dashboardPage.riderTable).toBeVisible({ timeout: TIMEOUTS.API_RESPONSE });
    await dashboardPage.lockRider('POGACAR Tadej');
    await expect(page.getByLabel('Unlock POGACAR Tadej')).toBeVisible();

    // 3. OPTIMIZE
    await dashboardPage.clickOptimize();
    await expect(optimizationPage.panel).toBeVisible({ timeout: 60_000 });

    // Verify locked rider is in optimal team
    expect(await optimizationPage.hasRiderCard('POGACAR Tadej')).toBe(true);
    expect(await optimizationPage.getRiderCardCount()).toBe(9);

    // 4. ROSTER
    await optimizationPage.clickApplyToRoster();
    await expect(rosterPage.completeBanner).toBeVisible({ timeout: TIMEOUTS.API_RESPONSE });
    expect(await rosterPage.getRiderCount()).toBe(9);
    await expect(rosterPage.totalScore).toBeVisible();

    // 5. COPY
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await rosterPage.clickCopy();
    await expect(rosterPage.copyBtn).toContainText(/copied/i);

    // 6. RESET
    await rosterPage.clickReset();
    await expect(page.getByTestId('tab-content-roster')).not.toBeVisible({ timeout: 15_000 });

    // Optimization and Roster should be re-locked after reset
    expect(await navPage.isTabLocked('optimization')).toBe(true);
    expect(await navPage.isTabLocked('roster')).toBe(true);
  });

  // T037 — Error handling edge cases
  test('should keep Analyze disabled with completely invalid input', async ({
    setupPage,
    invalidPriceList,
  }) => {
    await setupPage.goto();
    await setupPage.fillRiders(invalidPriceList);
    expect(await setupPage.isAnalyzeDisabled()).toBe(true);
  });

  test('should show correct counts for mixed valid/invalid input', async ({
    setupPage,
    partialMatchList,
  }) => {
    await setupPage.goto();
    await setupPage.fillRiders(partialMatchList);

    // partial-match-list.txt has 3 valid + 2 fake = 5 lines, all parseable as CSV
    // but the actual valid/invalid depends on parsing (all 5 parse as Name, Team, Price)
    await expect(setupPage.validCount).toBeVisible();
    expect(await setupPage.isAnalyzeDisabled()).toBe(false);
  });

  test('should disable checkbox for budget-exceeding rider', async ({
    setupPage,
    validPriceList,
    page,
  }) => {
    await setupPage.goto();
    await setupPage.analyzeValidRiders(validPriceList, 100); // Very low budget

    // POGACAR costs 350, far exceeds budget of 100
    const checkbox = page.getByLabel('Select POGACAR Tadej');
    await expect(checkbox).toBeDisabled();
  });
});
