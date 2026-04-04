import type { Locator, Page } from '@playwright/test';

export class NavPage {
  readonly themeToggle: Locator;

  private readonly page: Page;

  constructor(page: Page) {
    this.page = page;
    this.themeToggle = page.getByTestId('nav-theme-toggle');
  }

  /** Returns the visible tab locator (mobile or desktop variant). */
  private async getVisibleTabLocator(tab: string): Promise<Locator> {
    const desktop = this.page.getByTestId(`flow-tab-${tab}-desktop`);
    if (await desktop.isVisible()) return desktop;
    return this.page.getByTestId(`flow-tab-${tab}`);
  }

  async goToTab(tab: 'setup' | 'dashboard' | 'optimization' | 'roster'): Promise<void> {
    const locator = await this.getVisibleTabLocator(tab);
    await locator.click();
  }

  async toggleTheme(): Promise<void> {
    await this.themeToggle.click();
  }

  async isTabLocked(tab: string): Promise<boolean> {
    const locator = await this.getVisibleTabLocator(tab);
    return locator.isDisabled();
  }

  async isTabActive(tab: string): Promise<boolean> {
    const tabContent = this.page.getByTestId(`tab-content-${tab}`);
    return tabContent.isVisible();
  }

  async getCurrentTheme(): Promise<'light' | 'dark'> {
    const isDark = await this.page.evaluate(() =>
      document.documentElement.classList.contains('dark'),
    );
    return isDark ? 'dark' : 'light';
  }
}
