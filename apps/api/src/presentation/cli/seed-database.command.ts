import { Inject, Logger } from '@nestjs/common';
import { Command, CommandRunner, Option } from 'nest-commander';
import { TriggerScrapeUseCase } from '../../application/scraping/trigger-scrape.use-case';
import { CheckRaceScrapedUseCase } from '../../application/scraping/check-race-scraped.use-case';
import {
  DiscoverRacesUseCase,
  DiscoveredRace,
} from '../../application/scraping/discover-races.use-case';
import { FetchStartlistUseCase } from '../../application/benchmark/fetch-startlist.use-case';
import { ResolveAvatarsUseCase } from '../../application/avatar/resolve-avatars.use-case';
import {
  RACE_CATALOG_REPOSITORY_PORT,
  RaceCatalogRepositoryPort,
  CatalogRace,
} from '../../domain/race-catalog';
import { RaceType } from '../../domain/shared/race-type.enum';
import { RaceClass } from '../../domain/shared/race-class.enum';

interface SeedDatabaseOptions {
  years: number;
  circuit: string;
  class: string;
  dryRun: boolean;
  skipStartlists: boolean;
  skipAvatars: boolean;
}

interface SeedFailure {
  slug: string;
  year: number;
  reason: string;
  type: 'http' | 'no_results' | 'validation' | 'unknown';
}

interface StartlistStats {
  fetched: number;
  cached: number;
  empty: number;
  failed: number;
}

function classifyFailure(slug: string, year: number, msg: string): SeedFailure {
  let type: SeedFailure['type'] = 'unknown';
  if (msg.includes('HTTP') || msg.includes('Cloudflare')) type = 'http';
  else if (msg.includes('No results parsed')) type = 'no_results';
  else if (msg.includes('Validation failed') || msg.includes('completeness')) type = 'validation';
  return { slug, year, reason: msg, type };
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
    private readonly checkRaceScraped: CheckRaceScrapedUseCase,
    private readonly discoverRaces: DiscoverRacesUseCase,
    private readonly fetchStartlist: FetchStartlistUseCase,
    private readonly resolveAvatarsUseCase: ResolveAvatarsUseCase,
    @Inject(RACE_CATALOG_REPOSITORY_PORT)
    private readonly raceCatalogRepo: RaceCatalogRepositoryPort,
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

    const todayStr = new Date().toISOString().slice(0, 10);

    let totalRaces = 0;
    let totalRecords = 0;
    let totalSkipped = 0;
    let totalFutureSkipped = 0;
    let totalWarnings = 0;
    const failures: SeedFailure[] = [];
    const racesWithResults: { slug: string; year: number }[] = [];

    for (const year of years) {
      const discovered = await this.discoverRacesForYear(year, circuits);
      const filtered = discovered.filter((r) => allowedClasses.has(r.classText));
      const deduplicated = this.deduplicateBySlug(filtered);

      this.logger.log(`${year}: discovered ${deduplicated.length} races`);

      // Upsert all discovered races into the race catalog (past + future)
      const catalogEntries: CatalogRace[] = deduplicated.map((race) => ({
        slug: race.slug,
        name: race.name,
        raceType: this.mapRaceType(race),
        raceClass: this.mapRaceClass(race.classText),
        year,
        startDate: race.startDate,
      }));
      const catalogCount = await this.raceCatalogRepo.upsertMany(catalogEntries);
      this.logger.log(`${year}: upserted ${catalogCount} races into catalog`);

      if (options.dryRun) {
        for (const race of deduplicated) {
          const type = this.mapRaceType(race);
          const future = race.startDate && race.startDate > todayStr ? ' [FUTURE]' : '';
          this.logger.log(
            `  [DRY-RUN] ${race.slug} (${type}, ${race.classText})${future} — ${race.name}`,
          );
        }
        continue;
      }

      for (let i = 0; i < deduplicated.length; i++) {
        const race = deduplicated[i];
        const label = `[${year}] ${i + 1}/${deduplicated.length}: ${race.slug}`;

        // Skip future races
        if (race.startDate && race.startDate > todayStr) {
          this.logger.log(`  ${label} — skipping future race (starts ${race.startDate})`);
          totalFutureSkipped++;
          continue;
        }

        // Skip already scraped
        const alreadyScraped = await this.checkRaceScraped.execute(race.slug, year);
        if (alreadyScraped) {
          this.logger.log(`  ${label} — already scraped, skipping`);
          totalSkipped++;
          racesWithResults.push({ slug: race.slug, year });
          continue;
        }

        try {
          const raceType = this.mapRaceType(race);
          const raceClass = this.mapRaceClass(race.classText);

          this.logger.log(`  ${label} (${raceType}, ${race.classText})...`);

          const result = await this.triggerScrape.execute({
            raceSlug: race.slug,
            year,
            raceMetadata: {
              name: race.name,
              raceType,
              raceClass,
            },
          });

          this.logger.log(`  ${label} — ${result.status} (${result.recordsUpserted} records)`);
          totalRecords += result.recordsUpserted;
          totalRaces++;
          racesWithResults.push({ slug: race.slug, year });

          if (result.warnings.length > 0) {
            totalWarnings += result.warnings.length;
            for (const w of result.warnings) {
              this.logger.warn(`  ${label} — ${w}`);
            }
          }
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          this.logger.error(`  ${label} — FAILED: ${msg}`);
          failures.push(classifyFailure(race.slug, year, msg));
        }
      }
    }

    this.logger.log(
      `Race date backfill: all ${totalRecords} records from ${totalRaces} newly scraped races include raceDate via upsert`,
    );

    // Phase 2: Fetch startlists for all races with results
    const startlistStats = await this.fetchStartlists(racesWithResults, options);

    // Phase 3: Resolve rider avatars from Wikidata
    const avatarStats = await this.resolveAvatars(options);

    this.printSummary(
      totalRaces,
      totalRecords,
      totalSkipped,
      totalFutureSkipped,
      totalWarnings,
      failures,
      startlistStats,
      avatarStats,
    );
  }

  private async fetchStartlists(
    racesWithResults: { slug: string; year: number }[],
    options: SeedDatabaseOptions,
  ): Promise<StartlistStats> {
    const stats: StartlistStats = { fetched: 0, cached: 0, empty: 0, failed: 0 };

    if (options.skipStartlists || options.dryRun) {
      if (options.skipStartlists) {
        this.logger.log('Startlist scraping skipped (--skip-startlists)');
      }
      return stats;
    }

    this.logger.log('');
    this.logger.log(`=== STARTLISTS (${racesWithResults.length} races) ===`);

    for (let i = 0; i < racesWithResults.length; i++) {
      const { slug, year } = racesWithResults[i];
      const label = `[startlist] ${i + 1}/${racesWithResults.length}: ${slug} ${year}`;

      try {
        const result = await this.fetchStartlist.execute({ raceSlug: slug, year });

        if (result.fromCache) {
          stats.cached++;
          this.logger.log(`  ${label} — cached (${result.entries.length} riders)`);
        } else if (result.entries.length === 0) {
          stats.empty++;
          this.logger.log(`  ${label} — empty startlist`);
        } else {
          stats.fetched++;
          this.logger.log(`  ${label} — fetched ${result.entries.length} riders`);
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        this.logger.error(`  ${label} — FAILED: ${msg}`);
        stats.failed++;
      }
    }

    return stats;
  }

  private async resolveAvatars(
    options: SeedDatabaseOptions,
  ): Promise<{ resolved: number; total: number }> {
    if (options.skipAvatars || options.dryRun) {
      if (options.skipAvatars) {
        this.logger.log('Avatar resolution skipped (--skip-avatars)');
      }
      return { resolved: 0, total: 0 };
    }

    this.logger.log('');
    this.logger.log('=== AVATARS ===');

    const result = await this.resolveAvatarsUseCase.execute();
    this.logger.log(`Resolved ${result.resolved} of ${result.total} riders missing avatars`);

    return result;
  }

  private printSummary(
    totalRaces: number,
    totalRecords: number,
    totalSkipped: number,
    totalFutureSkipped: number,
    totalWarnings: number,
    failures: SeedFailure[],
    startlistStats: StartlistStats,
    avatarStats: { resolved: number; total: number },
  ): void {
    this.logger.log('');
    this.logger.log('=== SEED SUMMARY ===');
    this.logger.log(`Races scraped:     ${totalRaces}`);
    this.logger.log(`Records added:     ${totalRecords}`);
    this.logger.log(`Skipped (done):    ${totalSkipped}`);
    this.logger.log(`Skipped (future):  ${totalFutureSkipped}`);
    this.logger.log(`Warnings:          ${totalWarnings}`);
    this.logger.log(`Failed:            ${failures.length}`);
    this.logger.log('');
    this.logger.log('--- Startlists ---');
    this.logger.log(`Fetched:           ${startlistStats.fetched}`);
    this.logger.log(`Cached:            ${startlistStats.cached}`);
    this.logger.log(`Empty:             ${startlistStats.empty}`);
    this.logger.log(`Failed:            ${startlistStats.failed}`);
    this.logger.log('');
    this.logger.log('--- Avatars ---');
    this.logger.log(`Resolved:          ${avatarStats.resolved}`);
    this.logger.log(`Missing:           ${avatarStats.total - avatarStats.resolved}`);

    if (failures.length > 0) {
      const grouped = new Map<SeedFailure['type'], SeedFailure[]>();
      for (const f of failures) {
        const list = grouped.get(f.type) ?? [];
        list.push(f);
        grouped.set(f.type, list);
      }

      const labels: Record<SeedFailure['type'], string> = {
        http: 'HTTP errors',
        no_results: 'No results',
        validation: 'Validation errors',
        unknown: 'Unknown',
      };

      for (const [type, items] of grouped) {
        this.logger.log(`  ${labels[type]} (${items.length}):`);
        for (const f of items) {
          this.logger.log(`    - ${f.slug} ${f.year}: ${f.reason}`);
        }
      }
    }
  }

  private async discoverRacesForYear(year: number, circuits: string[]): Promise<DiscoveredRace[]> {
    return this.discoverRaces.execute(year, circuits);
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

  @Option({
    flags: '--skip-startlists',
    description: 'Skip startlist scraping (only scrape race results)',
    defaultValue: false,
  })
  parseSkipStartlists(val: string): boolean {
    return val === 'true' || val === '' || val === undefined;
  }

  @Option({
    flags: '--skip-avatars',
    description: 'Skip avatar resolution from Wikidata',
    defaultValue: false,
  })
  parseSkipAvatars(val: string): boolean {
    return val === 'true' || val === '' || val === undefined;
  }
}
