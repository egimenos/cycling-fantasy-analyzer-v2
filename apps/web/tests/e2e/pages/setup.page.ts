import type { Locator, Page } from '@playwright/test';
import { TIMEOUTS } from '../helpers/wait-helpers';

export class SetupPage {
  // Race selector (combobox)
  readonly raceSelectorTrigger: Locator;
  readonly raceSelectorInput: Locator;
  readonly gmvImportStatus: Locator;

  // Manual fallback (collapsible)
  readonly manualToggle: Locator;
  readonly raceUrlInput: Locator;
  readonly gameUrlInput: Locator;
  readonly fetchBtn: Locator;

  // Rider input
  readonly ridersTextarea: Locator;
  readonly budgetInput: Locator;
  readonly analyzeBtn: Locator;
  readonly validCount: Locator;
  readonly invalidCount: Locator;
  readonly analyzingSpinner: Locator;
  readonly analysisError: Locator;
  readonly emptyState: Locator;

  // Summary
  readonly summaryBudget: Locator;
  readonly summaryProjectedScore: Locator;

  // Reset
  readonly resetBtn: Locator;

  private readonly page: Page;

  constructor(page: Page) {
    this.page = page;
    // Race selector
    this.raceSelectorTrigger = page.getByTestId('race-selector-trigger');
    this.raceSelectorInput = page.getByTestId('race-selector-input');
    this.gmvImportStatus = page.getByTestId('gmv-import-status');

    // Manual fallback
    this.manualToggle = page.getByText('Enter URLs manually');
    this.raceUrlInput = page.getByTestId('setup-race-url-input');
    this.gameUrlInput = page.getByTestId('setup-game-url-input');
    this.fetchBtn = page.getByTestId('setup-fetch-btn');

    // Rider input
    this.ridersTextarea = page.getByTestId('setup-riders-textarea');
    this.budgetInput = page.getByTestId('setup-budget-input');
    this.analyzeBtn = page.getByTestId('setup-analyze-btn');
    this.validCount = page.getByTestId('setup-valid-count');
    this.invalidCount = page.getByTestId('setup-invalid-count');
    this.analyzingSpinner = page.getByTestId('setup-analyzing-spinner');
    this.analysisError = page.getByTestId('setup-analysis-error');
    this.emptyState = page.getByTestId('setup-empty-state');

    // Summary
    this.summaryBudget = page.getByTestId('setup-summary-budget');
    this.summaryProjectedScore = page.getByTestId('setup-summary-projected-score');

    // Reset
    this.resetBtn = page.getByRole('button', { name: /start new analysis/i });
  }

  async goto(): Promise<void> {
    await this.page.goto('/');
  }

  /** Select a race from the combobox by typing and clicking the match */
  async selectRace(searchText: string): Promise<void> {
    await this.raceSelectorTrigger.click();
    await this.raceSelectorInput.fill(searchText);
    await this.page
      .getByTestId('race-selector-item')
      .filter({ hasText: new RegExp(searchText, 'i') })
      .first()
      .click();
  }

  /** Expand the manual URL fallback section */
  async expandManualFallback(): Promise<void> {
    await this.manualToggle.click();
  }

  async fillRiders(text: string): Promise<void> {
    await this.ridersTextarea.fill(text);
  }

  async setBudget(budget: number): Promise<void> {
    await this.budgetInput.fill(String(budget));
  }

  async setRaceUrl(url: string): Promise<void> {
    await this.expandManualFallback();
    await this.raceUrlInput.fill(url);
  }

  async setGameUrl(url: string): Promise<void> {
    await this.gameUrlInput.fill(url);
  }

  async clickAnalyze(): Promise<void> {
    await this.analyzeBtn.click();
  }

  async clickFetch(): Promise<void> {
    await this.fetchBtn.click();
  }

  async clickReset(): Promise<void> {
    await this.resetBtn.click();
  }

  async analyzeValidRiders(riderText: string, budget = 2000): Promise<void> {
    await this.selectRace('Tour de France');
    await this.fillRiders(riderText);
    await this.setBudget(budget);
    await this.clickAnalyze();
    await this.page
      .getByTestId('tab-content-dashboard')
      .waitFor({ state: 'visible', timeout: TIMEOUTS.API_RESPONSE });
    // Wait for rider table to have at least one row before returning
    await this.page
      .getByTestId('dashboard-rider-table')
      .locator('table tbody tr')
      .first()
      .waitFor({ state: 'visible', timeout: TIMEOUTS.API_RESPONSE });
  }

  async isAnalyzeDisabled(): Promise<boolean> {
    return this.analyzeBtn.isDisabled();
  }

  async getValidCountText(): Promise<string> {
    return (await this.validCount.textContent()) ?? '';
  }

  async getInvalidCountText(): Promise<string> {
    return (await this.invalidCount.textContent()) ?? '';
  }
}
