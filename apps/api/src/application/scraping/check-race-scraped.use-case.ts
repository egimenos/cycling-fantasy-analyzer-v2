import { Inject, Injectable } from '@nestjs/common';
import {
  ScrapeJobRepositoryPort,
  SCRAPE_JOB_REPOSITORY_PORT,
} from '../../domain/scrape-job/scrape-job.repository.port';
import { ScrapeStatus } from '../../domain/shared/scrape-status.enum';

@Injectable()
export class CheckRaceScrapedUseCase {
  constructor(
    @Inject(SCRAPE_JOB_REPOSITORY_PORT)
    private readonly scrapeJobRepo: ScrapeJobRepositoryPort,
  ) {}

  async execute(raceSlug: string, year: number): Promise<boolean> {
    const job = await this.scrapeJobRepo.findByRaceAndYear(raceSlug, year, ScrapeStatus.SUCCESS);
    return job !== null;
  }
}
