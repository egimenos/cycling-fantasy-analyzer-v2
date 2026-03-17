import { Module } from '@nestjs/common';
import { drizzleProvider } from './drizzle.provider';
import { RIDER_REPOSITORY_PORT } from '../../domain/rider/rider.repository.port';
import { RACE_RESULT_REPOSITORY_PORT } from '../../domain/race-result/race-result.repository.port';
import { SCRAPE_JOB_REPOSITORY_PORT } from '../../domain/scrape-job/scrape-job.repository.port';
import { RiderRepositoryAdapter } from './rider.repository.adapter';
import { RaceResultRepositoryAdapter } from './race-result.repository.adapter';
import { ScrapeJobRepositoryAdapter } from './scrape-job.repository.adapter';

@Module({
  providers: [
    drizzleProvider,
    {
      provide: RIDER_REPOSITORY_PORT,
      useClass: RiderRepositoryAdapter,
    },
    {
      provide: RACE_RESULT_REPOSITORY_PORT,
      useClass: RaceResultRepositoryAdapter,
    },
    {
      provide: SCRAPE_JOB_REPOSITORY_PORT,
      useClass: ScrapeJobRepositoryAdapter,
    },
  ],
  exports: [RIDER_REPOSITORY_PORT, RACE_RESULT_REPOSITORY_PORT, SCRAPE_JOB_REPOSITORY_PORT],
})
export class DatabaseModule {}
