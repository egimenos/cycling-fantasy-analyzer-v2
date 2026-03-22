import type { Locator, Page } from '@playwright/test';
import { TIMEOUTS } from '../helpers/wait-helpers';

export class SetupPage {
  readonly raceUrlInput: Locator;
  readonly gameUrlInput: Locator;
  readonly fetchBtn: Locator;
  readonly ridersTextarea: Locator;
  readonly budgetInput: Locator;
  readonly analyzeBtn: Locator;
  readonly validCount: Locator;
  readonly invalidCount: Locator;
  readonly analyzingSpinner: Locator;
  readonly analysisError: Locator;
  readonly emptyState: Locator;

  private readonly page: Page;

  constructor(page: Page) {
    this.page = page;
    this.raceUrlInput = page.getByTestId('setup-race-url-input');
    this.gameUrlInput = page.getByTestId('setup-game-url-input');
    this.fetchBtn = page.getByTestId('setup-fetch-btn');
    this.ridersTextarea = page.getByTestId('setup-riders-textarea');
    this.budgetInput = page.getByTestId('setup-budget-input');
    this.analyzeBtn = page.getByTestId('setup-analyze-btn');
    this.validCount = page.getByTestId('setup-valid-count');
    this.invalidCount = page.getByTestId('setup-invalid-count');
    this.analyzingSpinner = page.getByTestId('setup-analyzing-spinner');
    this.analysisError = page.getByTestId('setup-analysis-error');
    this.emptyState = page.getByTestId('setup-empty-state');
  }

  async goto(): Promise<void> {
    await this.page.goto('/');
  }

  async fillRiders(text: string): Promise<void> {
    await this.ridersTextarea.fill(text);
  }

  async setBudget(budget: number): Promise<void> {
    await this.budgetInput.fill(String(budget));
  }

  async setRaceUrl(url: string): Promise<void> {
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

  async analyzeValidRiders(riderText: string, budget = 2000): Promise<void> {
    await this.fillRiders(riderText);
    await this.setBudget(budget);
    await this.clickAnalyze();
    await this.page
      .getByTestId('tab-content-dashboard')
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
