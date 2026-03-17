import { Inject, Injectable } from '@nestjs/common';
import {
  ScrapeJobRepositoryPort,
  SCRAPE_JOB_REPOSITORY_PORT,
} from '../../domain/scrape-job/scrape-job.repository.port';
import { ScrapeJob } from '../../domain/scrape-job/scrape-job.entity';

@Injectable()
export class GetScrapeJobsUseCase {
  constructor(
    @Inject(SCRAPE_JOB_REPOSITORY_PORT)
    private readonly scrapeJobRepo: ScrapeJobRepositoryPort,
  ) {}

  async execute(limit: number, status?: string): Promise<ScrapeJob[]> {
    return this.scrapeJobRepo.findRecent(limit, status);
  }
}
