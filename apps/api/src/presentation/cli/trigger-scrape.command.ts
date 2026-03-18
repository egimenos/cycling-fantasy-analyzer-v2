import { Logger } from '@nestjs/common';
import { Command, CommandRunner, Option } from 'nest-commander';
import { TriggerScrapeUseCase } from '../../application/scraping/trigger-scrape.use-case';
import { RaceType } from '../../domain/shared/race-type.enum';
import { RaceClass } from '../../domain/shared/race-class.enum';

interface TriggerScrapeOptions {
  race: string;
  year: number;
  type: RaceType;
  name?: string;
  class: RaceClass;
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
    const raceName = options.name ?? this.slugToName(options.race);
    this.logger.log(`Triggering scrape for ${options.race} ${options.year} (${options.type})`);

    const result = await this.triggerScrape.execute({
      raceSlug: options.race,
      year: options.year,
      raceMetadata: {
        name: raceName,
        raceType: options.type,
        raceClass: options.class,
      },
    });

    this.logger.log(
      `Job ${result.jobId}: ${result.status} (${result.recordsUpserted} records upserted)`,
    );

    if (result.warnings.length > 0) {
      this.logger.warn(`Warnings (${result.warnings.length}):`);
      for (const w of result.warnings) {
        this.logger.warn(`  - ${w}`);
      }
    }
  }

  private slugToName(slug: string): string {
    return slug
      .split('-')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
  }

  @Option({
    flags: '-r, --race <slug>',
    description: 'Race slug from PCS (e.g. tour-de-france, milano-sanremo)',
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

  @Option({
    flags: '-t, --type <type>',
    description: 'Race type: classic, grand_tour, or mini_tour',
    defaultValue: RaceType.CLASSIC,
  })
  parseType(val: string): RaceType {
    const normalized = val.toLowerCase();
    if (normalized === 'classic') return RaceType.CLASSIC;
    if (normalized === 'grand_tour') return RaceType.GRAND_TOUR;
    if (normalized === 'mini_tour') return RaceType.MINI_TOUR;
    throw new Error(`Invalid race type: ${val}. Use classic, grand_tour, or mini_tour`);
  }

  @Option({
    flags: '-n, --name <name>',
    description: 'Human-readable race name (defaults to slug capitalized)',
  })
  parseName(val: string): string {
    return val;
  }

  @Option({
    flags: '-c, --class <class>',
    description: 'Race class: UWT, Pro, or 1',
    defaultValue: RaceClass.UWT,
  })
  parseClass(val: string): RaceClass {
    if (val === 'UWT') return RaceClass.UWT;
    if (val === 'Pro') return RaceClass.PRO;
    if (val === '1') return RaceClass.ONE;
    throw new Error(`Invalid race class: ${val}. Use UWT, Pro, or 1`);
  }
}
