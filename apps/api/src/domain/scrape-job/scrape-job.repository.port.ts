import { ScrapeJob } from './scrape-job.entity';

export interface ScrapeJobRepositoryPort {
  save(job: ScrapeJob): Promise<void>;
  findById(id: string): Promise<ScrapeJob | null>;
  findRecent(limit: number, status?: string): Promise<ScrapeJob[]>;
  findStale(olderThanMinutes: number): Promise<ScrapeJob[]>;
}

export const SCRAPE_JOB_REPOSITORY_PORT = Symbol('ScrapeJobRepositoryPort');
