import type { Locator, Page } from '@playwright/test';

export class NavPage {
  readonly setupTab: Locator;
  readonly dashboardTab: Locator;
  readonly optimizationTab: Locator;
  readonly rosterTab: Locator;
  readonly themeToggle: Locator;

  private readonly page: Page;

  constructor(page: Page) {
    this.page = page;
    this.setupTab = page.getByTestId('flow-tab-setup');
    this.dashboardTab = page.getByTestId('flow-tab-dashboard');
    this.optimizationTab = page.getByTestId('flow-tab-optimization');
    this.rosterTab = page.getByTestId('flow-tab-roster');
    this.themeToggle = page.getByTestId('nav-theme-toggle');
  }

  private getTabLocator(tab: string): Locator {
    return this.page.getByTestId(`flow-tab-${tab}`);
  }

  async goToTab(tab: 'setup' | 'dashboard' | 'optimization' | 'roster'): Promise<void> {
    await this.getTabLocator(tab).click();
  }

  async toggleTheme(): Promise<void> {
    await this.themeToggle.click();
  }

  async isTabLocked(tab: string): Promise<boolean> {
    return this.getTabLocator(tab).isDisabled();
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
