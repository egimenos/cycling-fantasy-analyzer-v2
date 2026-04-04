import { test, expect } from '../fixtures/test-fixtures';

test.describe('Setup Tab', () => {
  // T021 — Valid price list analysis flow
  test('should analyze a valid price list and display rider table', async ({
    setupPage,
    dashboardPage,
    navPage,
    validPriceList,
  }) => {
    await setupPage.goto();

    await setupPage.fillRiders(validPriceList);
    await setupPage.setBudget(2000);

    // Verify analyze button is enabled
    expect(await setupPage.isAnalyzeDisabled()).toBe(false);

    await setupPage.clickAnalyze();

    // Wait for dashboard to appear (real API call)
    await expect(dashboardPage.riderTable).toBeVisible({ timeout: 30_000 });

    // Verify dashboard tab is unlocked
    expect(await navPage.isTabLocked('dashboard')).toBe(false);

    // Verify rider count is displayed
    await expect(dashboardPage.riderCount).toContainText(/showing/i);
  });

  // Race selector — combobox interaction
  test('should display race selector combobox with races from DB', async ({ setupPage }) => {
    await setupPage.goto();

    // Combobox trigger should be visible
    await expect(setupPage.raceSelectorTrigger).toBeVisible();
  });

  // T022 — Race URL auto-detect (manual fallback)
  test('should auto-detect race profile from PCS URL via manual fallback', async ({
    setupPage,
    page,
  }) => {
    test.slow(); // External HTTP call to PCS

    await setupPage.goto();
    await setupPage.setRaceUrl(
      'https://www.procyclingstats.com/race/tour-de-france/2025/startlist',
    );

    // Wait for race profile to appear
    await expect(page.getByTestId('race-profile-name')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('race-profile-name')).toContainText(/tour de france/i);
    await expect(page.getByTestId('race-profile-type')).toBeVisible();
  });

  // T023 — Game URL import via manual fallback
  test('should import price list from game URL via manual fallback', async ({ setupPage }) => {
    test.skip(!!process.env.SKIP_EXTERNAL, 'Skipped: external services unavailable');
    test.slow(); // External scraping call

    await setupPage.goto();
    await setupPage.expandManualFallback();

    await setupPage.setGameUrl(
      'https://grandesminivueltas.com/index.php/2026/03/07/paris-niza-2026/',
    );
    await setupPage.clickFetch();

    // Wait for textarea to be populated
    await expect(setupPage.ridersTextarea).not.toHaveValue('', { timeout: 30_000 });

    // Verify valid count appears
    await expect(setupPage.validCount).toBeVisible();
  });

  // T024 — Validation and edge cases
  test('should disable Analyze button when no valid riders', async ({ setupPage }) => {
    await setupPage.goto();

    // Initially disabled (empty textarea)
    expect(await setupPage.isAnalyzeDisabled()).toBe(true);
  });

  test('should show valid/invalid counts for mixed input', async ({ setupPage }) => {
    await setupPage.goto();

    await setupPage.fillRiders(
      'Tadej Pogacar, UAD, 500\nthis is not a rider\nJonas Vingegaard, TVL, 480',
    );

    await expect(setupPage.validCount).toContainText('2');
    await expect(setupPage.invalidCount).toContainText('1');
  });

  test('should enable Analyze button when valid riders exist', async ({ setupPage }) => {
    await setupPage.goto();

    await setupPage.fillRiders('Tadej Pogacar, UAD, 500');

    expect(await setupPage.isAnalyzeDisabled()).toBe(false);
  });

  test('should keep Analyze disabled with completely invalid input', async ({
    setupPage,
    invalidPriceList,
  }) => {
    await setupPage.goto();

    await setupPage.fillRiders(invalidPriceList);

    expect(await setupPage.isAnalyzeDisabled()).toBe(true);
  });

  // Analysis complete state — returning to setup
  test('should show analysis summary when returning to setup after analyze', async ({
    setupPage,
    dashboardPage,
    navPage,
    validPriceList,
    page,
  }) => {
    await setupPage.goto();
    await setupPage.fillRiders(validPriceList);
    await setupPage.setBudget(2000);
    await setupPage.clickAnalyze();

    // Wait for dashboard
    await expect(dashboardPage.riderTable).toBeVisible({ timeout: 30_000 });

    // Navigate back to setup
    await navPage.goToTab('setup');

    // Should show "Analysis Complete" (desktop only — hidden on mobile)
    await expect(page.getByText('Analysis Complete')).toBeVisible();
    await expect(setupPage.resetBtn).toBeVisible();
  });

  // Reset flow
  test('should reset all state when clicking Start New Analysis', async ({
    setupPage,
    dashboardPage,
    navPage,
    validPriceList,
    page,
  }) => {
    await setupPage.goto();
    await setupPage.fillRiders(validPriceList);
    await setupPage.setBudget(2000);
    await setupPage.clickAnalyze();

    await expect(dashboardPage.riderTable).toBeVisible({ timeout: 30_000 });

    // Go back and reset
    await navPage.goToTab('setup');
    await setupPage.clickReset();

    // Should stay on setup, dashboard locked again
    await expect(page.getByTestId('tab-content-setup')).toBeVisible();
    expect(await navPage.isTabLocked('dashboard')).toBe(true);
  });
});
