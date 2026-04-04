import { test, expect } from '../fixtures/test-fixtures';

test.describe('Dashboard Tab', () => {
  test.beforeEach(async ({ setupPage, validPriceList }) => {
    await setupPage.goto();
    await setupPage.analyzeValidRiders(validPriceList);
  });

  // T025 — Rider table display
  test('should display rider table with all columns', async ({ dashboardPage }) => {
    await expect(dashboardPage.riderTable).toBeVisible();

    // Verify column headers
    const headers = dashboardPage.riderTable.locator('th');
    await expect(headers).toHaveCount(10); // checkbox, #, Name, Team, Price, Score, Value, BPI, Match, Actions
  });

  test('should show correct rider count', async ({ dashboardPage }) => {
    await expect(dashboardPage.riderCount).toContainText(/showing \d+/i);
  });

  // T026 — Rider selection and team builder
  test('should add rider to team builder when selected via checkbox', async ({ dashboardPage }) => {
    await dashboardPage.selectRider('POGACAR Tadej');

    await expect(dashboardPage.rosterCount).toContainText('1');
  });

  test('should remove rider from team builder when deselected', async ({ dashboardPage }) => {
    await dashboardPage.selectRider('POGACAR Tadej');
    await expect(dashboardPage.rosterCount).toContainText('1');

    // Deselect
    await dashboardPage.selectRider('POGACAR Tadej');
    await expect(dashboardPage.rosterCount).toContainText('0');
  });

  test('should update budget tracking on selection', async ({ dashboardPage }) => {
    const initialBudget = await dashboardPage.getBudgetRemainingText();

    await dashboardPage.selectRider('POGACAR Tadej');

    const updatedBudget = await dashboardPage.getBudgetRemainingText();
    expect(updatedBudget).not.toBe(initialBudget);
  });

  // T027 — Lock/exclude rider interactions
  test('should lock a rider and show unlock button', async ({ dashboardPage, page }) => {
    await dashboardPage.lockRider('POGACAR Tadej');

    // Unlock button should now be visible (label changed)
    await expect(page.getByLabel('Unlock POGACAR Tadej')).toBeVisible();

    // Rider should be auto-selected in team builder
    await expect(dashboardPage.rosterCount).toContainText('1');
  });

  test('should prevent deselecting a locked rider', async ({ dashboardPage, page }) => {
    await dashboardPage.lockRider('POGACAR Tadej');
    await expect(dashboardPage.rosterCount).toContainText('1');

    // Checkbox should be disabled for locked rider
    const checkbox = page.getByLabel('Select POGACAR Tadej');
    await expect(checkbox).toBeDisabled();

    // Roster count should still be 1
    await expect(dashboardPage.rosterCount).toContainText('1');
  });

  test('should exclude a rider and disable its checkbox', async ({ dashboardPage, page }) => {
    await dashboardPage.excludeRider('VINGEGAARD Jonas');

    // Include button should now be visible
    await expect(page.getByLabel('Include VINGEGAARD Jonas')).toBeVisible();

    // Checkbox should be disabled
    const checkbox = page.getByLabel('Select VINGEGAARD Jonas');
    await expect(checkbox).toBeDisabled();
  });

  test('should include a previously excluded rider', async ({ dashboardPage, page }) => {
    await dashboardPage.excludeRider('VINGEGAARD Jonas');
    await expect(page.getByLabel('Include VINGEGAARD Jonas')).toBeVisible();

    // Include again
    await dashboardPage.includeRider('VINGEGAARD Jonas');
    await expect(page.getByLabel('Exclude VINGEGAARD Jonas')).toBeVisible();
  });

  // T028 — Filter buttons
  test('should filter to show only selected riders', async ({ dashboardPage }) => {
    await dashboardPage.selectRider('POGACAR Tadej');
    await dashboardPage.selectRider('VINGEGAARD Jonas');

    await dashboardPage.clickFilter('selected');

    const rowCount = await dashboardPage.getTableRowCount();
    expect(rowCount).toBe(2);

    // Reset filter
    await dashboardPage.clickFilter('all');
  });

  test('should filter to show only locked riders', async ({ dashboardPage }) => {
    await dashboardPage.lockRider('POGACAR Tadej');

    await dashboardPage.clickFilter('locked');

    const rowCount = await dashboardPage.getTableRowCount();
    expect(rowCount).toBe(1);
  });

  test('should filter to show only excluded riders', async ({ dashboardPage }) => {
    await dashboardPage.excludeRider('VINGEGAARD Jonas');

    await dashboardPage.clickFilter('excluded');

    const rowCount = await dashboardPage.getTableRowCount();
    expect(rowCount).toBe(1);
  });

  // ── Score rendering & sorting (refactor safety net) ──────────────────

  test('should render numeric score values in the Score column', async ({ dashboardPage }) => {
    // Score column is the 6th column (checkbox, #, Name, Team, Price, Score)
    const scoreCells = dashboardPage.riderTable.locator('table tbody tr td:nth-child(6)');
    const count = await scoreCells.count();
    expect(count).toBeGreaterThan(0);

    // At least one matched rider should have a visible numeric score (not "---")
    let hasNumericScore = false;
    for (let i = 0; i < Math.min(count, 5); i++) {
      const text = (await scoreCells.nth(i).textContent())?.trim() ?? '';
      if (text !== '---' && /\d/.test(text)) {
        hasNumericScore = true;
        break;
      }
    }
    expect(hasNumericScore).toBe(true);
  });

  test('should sort riders by score when Score header is clicked', async ({ dashboardPage }) => {
    const scoreHeader = dashboardPage.riderTable.locator('th').filter({ hasText: 'Score' });
    // Default sort is desc by score — click to toggle to asc then back to desc
    await scoreHeader.click(); // asc
    await scoreHeader.click(); // desc

    const scoreCells = dashboardPage.riderTable.locator('table tbody tr td:nth-child(6)');
    const count = await scoreCells.count();
    if (count >= 2) {
      const extractNumber = (text: string | null): number => {
        if (!text || text.trim() === '---') return -1;
        const match = text.match(/[\d.]+/);
        return match ? Number(match[0]) : -1;
      };
      const first = extractNumber(await scoreCells.nth(0).textContent());
      const second = extractNumber(await scoreCells.nth(1).textContent());
      // Both should be valid numbers in desc order
      if (first >= 0 && second >= 0) {
        expect(first).toBeGreaterThanOrEqual(second);
      }
    }
  });

  // ── Filter consistency after interactions ───────────────────────────

  test('should update filter counts after locking and excluding riders', async ({
    dashboardPage,
  }) => {
    // Lock a rider → locked filter should show count 1
    await dashboardPage.lockRider('POGACAR Tadej');
    await expect(dashboardPage.filterLocked).toContainText('1');

    // Exclude another → excluded filter should show count 1
    await dashboardPage.excludeRider('VINGEGAARD Jonas');
    await expect(dashboardPage.filterExcluded).toContainText('1');

    // Selected filter should count locked rider too
    await expect(dashboardPage.filterSelected).toContainText('1');

    // Switch to locked filter, verify only 1 row
    await dashboardPage.clickFilter('locked');
    expect(await dashboardPage.getTableRowCount()).toBe(1);

    // Switch to excluded, verify only 1 row
    await dashboardPage.clickFilter('excluded');
    expect(await dashboardPage.getTableRowCount()).toBe(1);

    // Switch back to all, verify full list
    await dashboardPage.clickFilter('all');
    const totalCount = await dashboardPage.getTableRowCount();
    expect(totalCount).toBeGreaterThan(2);
  });

  // ── Team builder metrics update on selection ────────────────────────

  test('should update projected score when riders are selected', async ({ dashboardPage }) => {
    const initialScore = await dashboardPage.getProjectedScoreText();

    await dashboardPage.selectRider('POGACAR Tadej');

    const updatedScore = await dashboardPage.getProjectedScoreText();
    expect(updatedScore).not.toBe(initialScore);
  });

  // T029 — Team completion flow
  test('should show Review Team button when 9 riders selected', async ({ dashboardPage }) => {
    // Select 9 cheapest riders (from the bottom of the fixture list)
    const cheapRiders = [
      "O'CONNOR Ben",
      'TIBERI Antonio',
      'LOPEZ Miguel Angel',
      'PIDCOCK Tom',
      'CICCONE Giulio',
      'VLASOV Aleksandr',
      'KUSS Sepp',
      'HINDLEY Jai',
      'BARDET Romain',
    ];

    for (const rider of cheapRiders) {
      await dashboardPage.selectRider(rider);
    }

    await expect(dashboardPage.rosterCount).toContainText('9');
    await expect(dashboardPage.reviewTeamBtn).toBeVisible();
  });
});
