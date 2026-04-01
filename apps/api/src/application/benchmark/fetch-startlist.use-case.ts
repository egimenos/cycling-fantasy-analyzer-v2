import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  StartlistRepositoryPort,
  STARTLIST_REPOSITORY_PORT,
} from '../../domain/startlist/startlist.repository.port';
import {
  RiderRepositoryPort,
  RIDER_REPOSITORY_PORT,
} from '../../domain/rider/rider.repository.port';
import { PcsScraperPort, PCS_SCRAPER_PORT } from '../scraping/ports/pcs-scraper.port';
import { StartlistEntry } from '../../domain/startlist/startlist-entry.entity';
import { Rider } from '../../domain/rider/rider.entity';
import { parseStartlist } from '../../infrastructure/scraping/parsers/startlist.parser';

export interface FetchStartlistInput {
  readonly raceSlug: string;
  readonly year: number;
}

export interface FetchStartlistOutput {
  readonly entries: StartlistEntry[];
  readonly fromCache: boolean;
}

@Injectable()
export class FetchStartlistUseCase {
  private readonly logger = new Logger(FetchStartlistUseCase.name);

  constructor(
    @Inject(STARTLIST_REPOSITORY_PORT)
    private readonly startlistRepo: StartlistRepositoryPort,
    @Inject(RIDER_REPOSITORY_PORT)
    private readonly riderRepo: RiderRepositoryPort,
    @Inject(PCS_SCRAPER_PORT)
    private readonly pcsClient: PcsScraperPort,
  ) {}

  async execute(input: FetchStartlistInput): Promise<FetchStartlistOutput> {
    // 1. Check if startlist already exists in DB
    const exists = await this.startlistRepo.existsForRace(input.raceSlug, input.year);
    if (exists) {
      const entries = await this.startlistRepo.findByRace(input.raceSlug, input.year);
      this.logger.log(
        `Loaded cached startlist for ${input.raceSlug} ${input.year}: ${entries.length} riders`,
      );
      return { entries, fromCache: true };
    }

    // 2. Scrape from PCS
    const path = `race/${input.raceSlug}/${input.year}/startlist`;
    this.logger.log(`Scraping startlist: ${path}`);
    const html = await this.pcsClient.fetchPage(path);
    const parsed = parseStartlist(html);

    if (parsed.length === 0) {
      this.logger.warn(`Empty startlist for ${input.raceSlug} ${input.year}`);
      return { entries: [], fromCache: false };
    }

    // 3. Ensure all riders exist in DB (create missing ones)
    const slugs = parsed.map((p) => p.riderSlug);
    const existingRiders = await this.riderRepo.findByPcsSlugs(slugs);
    const existingBySlug = new Map(existingRiders.map((r) => [r.pcsSlug, r]));

    const ridersToSave: Rider[] = [];
    const riderIdMap = new Map<string, string>();

    for (const p of parsed) {
      let rider = existingBySlug.get(p.riderSlug);
      if (!rider) {
        rider = Rider.create({
          pcsSlug: p.riderSlug,
          fullName: p.riderName,
          currentTeam: p.teamName || null,
          nationality: null,
          birthDate: null,
          lastScrapedAt: new Date(),
        });
        ridersToSave.push(rider);
      }
      riderIdMap.set(p.riderSlug, rider.id);
    }

    if (ridersToSave.length > 0) {
      await this.riderRepo.saveMany(ridersToSave);
      this.logger.log(`Created ${ridersToSave.length} new riders from startlist`);
    }

    // 4. Create and persist startlist entries
    const entries = parsed.map((p) =>
      StartlistEntry.create({
        raceSlug: input.raceSlug,
        year: input.year,
        riderId: riderIdMap.get(p.riderSlug)!,
        teamName: p.teamName || null,
        bibNumber: p.bibNumber,
        scrapedAt: new Date(),
      }),
    );

    await this.startlistRepo.saveMany(entries);
    this.logger.log(
      `Persisted startlist for ${input.raceSlug} ${input.year}: ${entries.length} riders`,
    );

    return { entries, fromCache: false };
  }
}
