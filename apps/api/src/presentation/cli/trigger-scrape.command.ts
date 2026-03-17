import { Logger } from '@nestjs/common';
import { Command, CommandRunner, Option } from 'nest-commander';
import { TriggerScrapeUseCase } from '../../application/scraping/trigger-scrape.use-case';

interface TriggerScrapeOptions {
  race: string;
  year: number;
}

@Command({
  name: 'trigger-scrape',
  description: 'Trigger a scraping job for a specific race and year',
})
export class TriggerScrapeCommand extends CommandRunner {
  private readonly logger = new Logger(TriggerScrapeCommand.name);

  constructor(private readonly triggerScrape: TriggerScrapeUseCase) {
    super();
  }

  async run(_passedParams: string[], options: TriggerScrapeOptions): Promise<void> {
    this.logger.log(`Triggering scrape for ${options.race} ${options.year}`);

    const result = await this.triggerScrape.execute({
      raceSlug: options.race,
      year: options.year,
    });

    this.logger.log(
      `Job ${result.jobId}: ${result.status} (${result.recordsUpserted} records upserted)`,
    );
  }

  @Option({
    flags: '-r, --race <slug>',
    description: 'Race slug from catalog (e.g. tour-de-france, milano-sanremo)',
    required: true,
  })
  parseRace(val: string): string {
    return val;
  }

  @Option({
    flags: '-y, --year <year>',
    description: 'Race year (2020-2030)',
    required: true,
  })
  parseYear(val: string): number {
    const year = parseInt(val, 10);
    if (isNaN(year) || year < 2020 || year > 2030) {
      throw new Error('Year must be between 2020 and 2030');
    }
    return year;
  }
}
