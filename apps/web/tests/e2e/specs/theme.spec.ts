import { test, expect } from '../fixtures/test-fixtures';

test.describe('Theme Toggle', () => {
  test.beforeEach(async ({ page }) => {
    // Clear localStorage to avoid state leaking between tests
    await page.goto('/');
    await page.evaluate(() => localStorage.removeItem('theme'));
    await page.reload();
  });

  // T035 — Theme toggle and persistence
  test('should switch theme on toggle click', async ({ navPage }) => {
    const initialTheme = await navPage.getCurrentTheme();
    await navPage.toggleTheme();
    const newTheme = await navPage.getCurrentTheme();

    expect(newTheme).not.toBe(initialTheme);
  });

  test('should persist theme in localStorage', async ({ navPage, page }) => {
    await navPage.toggleTheme();

    const stored = await page.evaluate(() => localStorage.getItem('theme'));
    expect(stored).toBeTruthy();
  });

  test('should persist theme across page reload', async ({ navPage, page }) => {
    const initialTheme = await navPage.getCurrentTheme();
    await navPage.toggleTheme();
    const switchedTheme = await navPage.getCurrentTheme();
    expect(switchedTheme).not.toBe(initialTheme);

    await page.reload();

    const reloadedTheme = await navPage.getCurrentTheme();
    expect(reloadedTheme).toBe(switchedTheme);
  });

  test('should toggle back to original theme', async ({ navPage }) => {
    const original = await navPage.getCurrentTheme();
    await navPage.toggleTheme();
    await navPage.toggleTheme();
    const finalTheme = await navPage.getCurrentTheme();

    expect(finalTheme).toBe(original);
  });
});
