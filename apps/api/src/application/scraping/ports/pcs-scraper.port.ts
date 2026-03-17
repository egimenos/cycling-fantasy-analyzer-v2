export interface PcsScraperPort {
  fetchPage(path: string): Promise<string>;
}

export const PCS_SCRAPER_PORT = Symbol('PcsScraperPort');
