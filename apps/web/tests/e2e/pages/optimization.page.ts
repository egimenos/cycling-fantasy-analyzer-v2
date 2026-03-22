import type { Locator, Page } from '@playwright/test';

export class OptimizationPage {
  readonly panel: Locator;
  readonly projectedTotal: Locator;
  readonly budgetEfficiency: Locator;
  readonly applyBtn: Locator;
  readonly lineup: Locator;
  readonly scoreBreakdown: Locator;

  private readonly page: Page;

  constructor(page: Page) {
    this.page = page;
    this.panel = page.getByTestId('optimization-panel');
    this.projectedTotal = page.getByTestId('optimization-projected-total');
    this.budgetEfficiency = page.getByTestId('optimization-budget-efficiency');
    this.applyBtn = page.getByTestId('optimization-apply-btn');
    this.lineup = page.getByTestId('optimization-lineup');
    this.scoreBreakdown = page.getByTestId('optimization-score-breakdown');
  }

  async clickApplyToRoster(): Promise<void> {
    await this.applyBtn.click();
  }

  async getRiderCardCount(): Promise<number> {
    return this.page.locator('[data-testid^="optimization-rider-card-"]').count();
  }

  async hasRiderCard(riderName: string): Promise<boolean> {
    return this.page.getByTestId(`optimization-rider-card-${riderName}`).isVisible();
  }

  async getProjectedTotalText(): Promise<string> {
    return (await this.projectedTotal.textContent()) ?? '';
  }

  async getBudgetEfficiencyText(): Promise<string> {
    return (await this.budgetEfficiency.textContent()) ?? '';
  }
}
