import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'fs';
import { join } from 'path';

const validPriceList = readFileSync(join(__dirname, 'fixtures/valid-price-list.txt'), 'utf-8');

const invalidPriceList = readFileSync(join(__dirname, 'fixtures/invalid-price-list.txt'), 'utf-8');

async function analyzeValidPriceList(page: Page) {
  await page.goto('/');

  // Fill rider list textarea
  await page.locator('#rider-input').fill(validPriceList);

  // Set budget
  await page.locator('#budget').fill('2000');

  // Click Analyze
  await page.getByRole('button', { name: /analyze/i }).click();

  // Wait for results
  await expect(page.getByText(/showing \d+ rider/i)).toBeVisible({
    timeout: 30_000,
  });
}

test.describe('Full Workflow', () => {
  test('should analyze a valid price list and display rider table', async ({ page }) => {
    await analyzeValidPriceList(page);

    // Verify rider table has rows
    await expect(page.getByText(/matched/i)).toBeVisible();

    // Verify score column exists
    await expect(page.getByText('Score')).toBeVisible();
  });

  test('should optimize and display optimal team', async ({ page }) => {
    await analyzeValidPriceList(page);

    // Click "Get Optimal Team"
    await page.getByRole('button', { name: /get optimal team/i }).click();

    // Wait for optimization result
    await expect(page.getByText(/optimal team/i)).toBeVisible({
      timeout: 30_000,
    });

    // Verify score breakdown categories are shown
    await expect(page.getByText('GC')).toBeVisible();
  });

  test('should include locked riders in optimized team', async ({ page }) => {
    await analyzeValidPriceList(page);

    // Get the first rider's name
    const firstRiderName = await page
      .locator('table tbody tr')
      .first()
      .locator('span.font-medium')
      .first()
      .textContent();

    // Lock the first rider
    await page.getByRole('button', { name: new RegExp(`Lock ${firstRiderName}`) }).click();

    // Optimize
    await page.getByRole('button', { name: /get optimal team/i }).click();
    await expect(page.getByText(/optimal team/i)).toBeVisible({
      timeout: 30_000,
    });

    // Verify locked rider is in the optimal team card
    if (firstRiderName) {
      const teamCard = page.locator('text=Optimal Team').locator('..');
      await expect(teamCard).toContainText(firstRiderName);
    }
  });

  test('should allow manual team selection with budget tracking', async ({ page }) => {
    await analyzeValidPriceList(page);

    // Select first rider via checkbox
    const firstCheckbox = page.getByRole('checkbox').first();
    await firstCheckbox.click();

    // Verify team builder panel shows 1 rider
    await expect(page.getByText(/Team Builder \(1 \/ 9\)/)).toBeVisible();

    // Verify budget indicator is visible
    await expect(page.getByText(/H/)).toBeVisible();
  });

  test('should handle invalid input gracefully', async ({ page }) => {
    await page.goto('/');

    // Fill with invalid text
    await page.locator('#rider-input').fill(invalidPriceList);

    // The Analyze button should be disabled (no valid riders parsed)
    await expect(page.getByRole('button', { name: /analyze/i })).toBeDisabled();

    // The input should show "0 valid riders"
    await expect(page.getByText('0 valid riders')).toBeVisible();
  });
});
