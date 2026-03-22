import type { Locator, Page } from '@playwright/test';

export class RosterPage {
  readonly completeBanner: Locator;
  readonly resetBtn: Locator;
  readonly copyBtn: Locator;
  readonly riderList: Locator;
  readonly captainBadge: Locator;
  readonly totalScore: Locator;
  readonly totalCost: Locator;
  readonly remaining: Locator;
  readonly avgRider: Locator;

  private readonly page: Page;

  constructor(page: Page) {
    this.page = page;
    this.completeBanner = page.getByTestId('roster-complete-banner');
    this.resetBtn = page.getByTestId('roster-reset-btn');
    this.copyBtn = page.getByTestId('roster-copy-btn');
    this.riderList = page.getByTestId('roster-rider-list');
    this.captainBadge = page.getByTestId('roster-captain-badge');
    this.totalScore = page.getByTestId('roster-total-score');
    this.totalCost = page.getByTestId('roster-total-cost');
    this.remaining = page.getByTestId('roster-remaining');
    this.avgRider = page.getByTestId('roster-avg-rider');
  }

  async clickReset(): Promise<void> {
    await this.resetBtn.click();
  }

  async clickCopy(): Promise<void> {
    await this.copyBtn.click();
  }

  async getRiderCount(): Promise<number> {
    return this.page.locator('[data-testid^="roster-rider-"]').count();
  }

  async getTotalScoreText(): Promise<string> {
    return (await this.totalScore.textContent()) ?? '';
  }

  async getTotalCostText(): Promise<string> {
    return (await this.totalCost.textContent()) ?? '';
  }

  async getCopyButtonText(): Promise<string> {
    return (await this.copyBtn.textContent()) ?? '';
  }
}
