import { Inject, Logger } from '@nestjs/common';
import { Command, CommandRunner, Option } from 'nest-commander';
import { TriggerScrapeUseCase } from '../../application/scraping/trigger-scrape.use-case';
import {
  PcsScraperPort,
  PCS_SCRAPER_PORT,
} from '../../application/scraping/ports/pcs-scraper.port';
import {
  ScrapeJobRepositoryPort,
  SCRAPE_JOB_REPOSITORY_PORT,
} from '../../domain/scrape-job/scrape-job.repository.port';
import {
  parseRaceList,
  DiscoveredRace,
} from '../../infrastructure/scraping/parsers/race-list.parser';
import { RaceType } from '../../domain/shared/race-type.enum';
import { RaceClass } from '../../domain/shared/race-class.enum';
import { findRaceBySlug } from '../../domain/race/race-catalog';
import { ScrapeStatus } from '../../domain/shared/scrape-status.enum';

interface SeedDatabaseOptions {
  years: number;
  circuit: string;
  class: string;
  dryRun: boolean;
}

const GRAND_TOUR_SLUGS = new Set(['tour-de-france', 'giro-d-italia', 'vuelta-a-espana']);

@Command({
  name: 'seed-database',
  description:
    'Seed DB with WT + ProSeries + Europe Tour .1 races from the last N years (default: 3)',
})
export class SeedDatabaseCommand extends CommandRunner {
  private readonly logger = new Logger(SeedDatabaseCommand.name);

  constructor(
    private readonly triggerScrape: TriggerScrapeUseCase,
    @Inject(PCS_SCRAPER_PORT)
    private readonly pcsClient: PcsScraperPort,
    @Inject(SCRAPE_JOB_REPOSITORY_PORT)
    private readonly scrapeJobRepo: ScrapeJobRepositoryPort,
  ) {
    super();
  }

  async run(_passedParams: string[], options: SeedDatabaseOptions): Promise<void> {
    const circuits = options.circuit.split(',').map((c) => c.trim());
    const allowedClasses = new Set(options.class.split(',').map((c) => c.trim()));
    const currentYear = new Date().getFullYear();
    const fromYear = currentYear - options.years + 1;
    const years = this.buildYearRange(fromYear, currentYear);

    this.logger.log(
      `Seed: years ${fromYear}-${currentYear} (${options.years} years), circuits: ${circuits.join(', ')}, classes: ${[...allowedClasses].join(', ')}`,
    );

    let totalRaces = 0;
    let totalRecords = 0;
    let totalSkipped = 0;
    let totalFailed = 0;

    for (const year of years) {
      const discovered = await this.discoverRacesForYear(year, circuits);
      const filtered = discovered.filter((r) => allowedClasses.has(r.classText));
      const deduplicated = this.deduplicateBySlug(filtered);

      this.logger.log(`${year}: discovered ${deduplicated.length} races`);

      if (options.dryRun) {
        for (const race of deduplicated) {
          const type = this.mapRaceType(race);
          this.logger.log(`  [DRY-RUN] ${race.slug} (${type}, ${race.classText}) — ${race.name}`);
        }
        continue;
      }

      for (let i = 0; i < deduplicated.length; i++) {
        const race = deduplicated[i];
        const label = `[${year}] ${i + 1}/${deduplicated.length}: ${race.slug}`;

        // Skip already scraped
        const existing = await this.scrapeJobRepo.findByRaceAndYear(
          race.slug,
          year,
          ScrapeStatus.SUCCESS,
        );
        if (existing) {
          this.logger.log(`  ${label} — already scraped, skipping`);
          totalSkipped++;
          continue;
        }

        try {
          const raceType = this.mapRaceType(race);
          const raceClass = this.mapRaceClass(race.classText);

          this.logger.log(`  ${label} (${raceType}, ${race.classText})...`);

          const result = await this.triggerScrape.execute({
            raceSlug: race.slug,
            year,
            raceMetadata: findRaceBySlug(race.slug)
              ? undefined
              : {
                  name: race.name,
                  raceType,
                  raceClass,
                  expectedStages: undefined,
                },
          });

          this.logger.log(`  ${label} — ${result.status} (${result.recordsUpserted} records)`);
          totalRecords += result.recordsUpserted;
          totalRaces++;
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          this.logger.error(`  ${label} — FAILED: ${msg}`);
          totalFailed++;
        }
      }
    }

    this.logger.log('');
    this.logger.log('=== SEED SUMMARY ===');
    this.logger.log(`Races scraped:  ${totalRaces}`);
    this.logger.log(`Records added:  ${totalRecords}`);
    this.logger.log(`Skipped:        ${totalSkipped}`);
    this.logger.log(`Failed:         ${totalFailed}`);
  }

  private async discoverRacesForYear(year: number, circuits: string[]): Promise<DiscoveredRace[]> {
    const all: DiscoveredRace[] = [];

    for (const circuit of circuits) {
      const url = `races.php?year=${year}&circuit=${circuit}&filter=Filter`;
      this.logger.debug(`Fetching calendar: ${url}`);

      const html = await this.pcsClient.fetchPage(url);
      const races = parseRaceList(html);
      all.push(...races);
    }

    return all;
  }

  private deduplicateBySlug(races: DiscoveredRace[]): DiscoveredRace[] {
    const seen = new Set<string>();
    return races.filter((r) => {
      if (seen.has(r.slug)) return false;
      seen.add(r.slug);
      return true;
    });
  }

  private mapRaceType(race: DiscoveredRace): RaceType {
    if (GRAND_TOUR_SLUGS.has(race.slug)) return RaceType.GRAND_TOUR;
    if (race.raceType === 'ONE_DAY') return RaceType.CLASSIC;
    return RaceType.MINI_TOUR;
  }

  private mapRaceClass(classText: string): RaceClass {
    if (classText.includes('UWT')) return RaceClass.UWT;
    if (classText.includes('Pro')) return RaceClass.PRO;
    return RaceClass.ONE;
  }

  private buildYearRange(from: number, to: number): number[] {
    const years: number[] = [];
    for (let y = from; y <= to; y++) years.push(y);
    return years;
  }

  @Option({
    flags: '--years <count>',
    description: 'Number of years to seed (default: 3, e.g. 3 = 2024-2026)',
    defaultValue: 3,
  })
  parseYears(val: string): number {
    const count = parseInt(val, 10);
    if (isNaN(count) || count < 1 || count > 10) {
      throw new Error('Years must be between 1 and 10');
    }
    return count;
  }

  @Option({
    flags: '--circuit <ids>',
    description:
      'Comma-separated PCS circuit IDs (default: 1,26,14 = WT + ProSeries + Europe Tour)',
    defaultValue: '1,26,14',
  })
  parseCircuit(val: string): string {
    return val;
  }

  @Option({
    flags: '--class <classes>',
    description: 'Comma-separated allowed race classes (default: 1.UWT,2.UWT,1.Pro,2.Pro,1.1,2.1)',
    defaultValue: '1.UWT,2.UWT,1.Pro,2.Pro,1.1,2.1',
  })
  parseClass(val: string): string {
    return val;
  }

  @Option({
    flags: '--dry-run',
    description: 'Show discovered races without scraping',
    defaultValue: false,
  })
  parseDryRun(val: string): boolean {
    return val === 'true' || val === '' || val === undefined;
  }
}
