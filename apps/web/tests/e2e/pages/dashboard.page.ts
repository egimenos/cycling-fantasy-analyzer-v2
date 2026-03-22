import type { Locator, Page } from '@playwright/test';

export class DashboardPage {
  // Table
  readonly riderTable: Locator;
  readonly riderCount: Locator;

  // Filters
  readonly filterAll: Locator;
  readonly filterSelected: Locator;
  readonly filterLocked: Locator;
  readonly filterExcluded: Locator;
  readonly filterUnmatched: Locator;

  // Team Builder
  readonly teamBuilder: Locator;
  readonly rosterCount: Locator;
  readonly budgetRemaining: Locator;
  readonly projectedScore: Locator;
  readonly optimizeBtn: Locator;
  readonly reviewTeamBtn: Locator;
  readonly clearAllBtn: Locator;

  private readonly page: Page;

  constructor(page: Page) {
    this.page = page;

    // Table
    this.riderTable = page.getByTestId('dashboard-rider-table');
    this.riderCount = page.getByTestId('dashboard-rider-count');

    // Filters
    this.filterAll = page.getByTestId('dashboard-filter-all');
    this.filterSelected = page.getByTestId('dashboard-filter-selected');
    this.filterLocked = page.getByTestId('dashboard-filter-locked');
    this.filterExcluded = page.getByTestId('dashboard-filter-excluded');
    this.filterUnmatched = page.getByTestId('dashboard-filter-unmatched');

    // Team Builder
    this.teamBuilder = page.getByTestId('dashboard-team-builder');
    this.rosterCount = page.getByTestId('dashboard-roster-count');
    this.budgetRemaining = page.getByTestId('dashboard-budget-remaining');
    this.projectedScore = page.getByTestId('dashboard-projected-score');
    this.optimizeBtn = page.getByTestId('dashboard-optimize-btn');
    this.reviewTeamBtn = page.getByTestId('dashboard-review-btn');
    this.clearAllBtn = page.getByTestId('dashboard-clear-all-btn');
  }

  // Per-rider actions via aria-label
  async selectRider(name: string): Promise<void> {
    await this.page.getByLabel(`Select ${name}`).click();
  }

  async lockRider(name: string): Promise<void> {
    await this.page.getByLabel(`Lock ${name}`).click();
  }

  async unlockRider(name: string): Promise<void> {
    await this.page.getByLabel(`Unlock ${name}`).click();
  }

  async excludeRider(name: string): Promise<void> {
    await this.page.getByLabel(`Exclude ${name}`).click();
  }

  async includeRider(name: string): Promise<void> {
    await this.page.getByLabel(`Include ${name}`).click();
  }

  async clickFilter(
    filter: 'all' | 'selected' | 'locked' | 'excluded' | 'unmatched',
  ): Promise<void> {
    await this.page.getByTestId(`dashboard-filter-${filter}`).click();
  }

  async clickOptimize(): Promise<void> {
    await this.optimizeBtn.click();
  }

  async clickReviewTeam(): Promise<void> {
    await this.reviewTeamBtn.click();
  }

  async getTableRowCount(): Promise<number> {
    return this.riderTable.locator('table tbody tr').count();
  }

  // Assertions
  async getRosterCountText(): Promise<string> {
    return (await this.rosterCount.textContent()) ?? '';
  }

  async getBudgetRemainingText(): Promise<string> {
    return (await this.budgetRemaining.textContent()) ?? '';
  }

  async getProjectedScoreText(): Promise<string> {
    return (await this.projectedScore.textContent()) ?? '';
  }

  async isReviewTeamVisible(): Promise<boolean> {
    return this.reviewTeamBtn.isVisible();
  }

  async isOptimizeVisible(): Promise<boolean> {
    return this.optimizeBtn.isVisible();
  }
}
