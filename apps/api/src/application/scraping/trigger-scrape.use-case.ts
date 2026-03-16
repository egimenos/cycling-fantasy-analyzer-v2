import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  RiderRepositoryPort,
  RIDER_REPOSITORY_PORT,
} from '../../domain/rider/rider.repository.port';
import {
  RaceResultRepositoryPort,
  RACE_RESULT_REPOSITORY_PORT,
} from '../../domain/race-result/race-result.repository.port';
import {
  ScrapeJobRepositoryPort,
  SCRAPE_JOB_REPOSITORY_PORT,
} from '../../domain/scrape-job/scrape-job.repository.port';
import { ScrapeJob } from '../../domain/scrape-job/scrape-job.entity';
import { Rider } from '../../domain/rider/rider.entity';
import { RaceResult } from '../../domain/race-result/race-result.entity';
import { findRaceBySlug, RaceCatalogEntry } from '../../domain/race/race-catalog';
import { RaceType } from '../../domain/shared/race-type.enum';
import { PcsScraperPort, PCS_SCRAPER_PORT } from './ports/pcs-scraper.port';
import { extractClassificationUrls } from '../../infrastructure/scraping/parsers/classification-extractor';
import {
  parseGcResults,
  parseStageResults,
  parseMountainClassification,
  parseSprintClassification,
} from '../../infrastructure/scraping/parsers/stage-race.parser';
import { parseClassicResults } from '../../infrastructure/scraping/parsers/classic.parser';
import { ParsedResult } from '../../infrastructure/scraping/parsers/parsed-result.type';
import {
  validateClassificationResults,
  validateStageRaceCompleteness,
} from '../../infrastructure/scraping/validation/parse-validator';

export interface TriggerScrapeInput {
  readonly raceSlug: string;
  readonly year: number;
}

export interface TriggerScrapeOutput {
  readonly jobId: string;
  readonly status: string;
  readonly recordsUpserted: number;
}

@Injectable()
export class TriggerScrapeUseCase {
  private readonly logger = new Logger(TriggerScrapeUseCase.name);

  constructor(
    @Inject(PCS_SCRAPER_PORT)
    private readonly pcsClient: PcsScraperPort,
    @Inject(RIDER_REPOSITORY_PORT)
    private readonly riderRepo: RiderRepositoryPort,
    @Inject(RACE_RESULT_REPOSITORY_PORT)
    private readonly resultRepo: RaceResultRepositoryPort,
    @Inject(SCRAPE_JOB_REPOSITORY_PORT)
    private readonly scrapeJobRepo: ScrapeJobRepositoryPort,
  ) {}

  async execute(input: TriggerScrapeInput): Promise<TriggerScrapeOutput> {
    const catalogEntry = findRaceBySlug(input.raceSlug);
    if (!catalogEntry) {
      throw new NotFoundException(`Race "${input.raceSlug}" not found in catalog`);
    }

    const job = ScrapeJob.create(input.raceSlug, input.year);
    await this.scrapeJobRepo.save(job);

    const runningJob = job.markRunning();
    await this.scrapeJobRepo.save(runningJob);

    try {
      const allResults = await this.scrapeRace(catalogEntry, input.year);
      const recordsUpserted = await this.persistResults(allResults, catalogEntry, input.year);

      const completedJob = runningJob.markSuccess(recordsUpserted);
      await this.scrapeJobRepo.save(completedJob);

      return {
        jobId: job.id,
        status: completedJob.status,
        recordsUpserted,
      };
    } catch (error) {
      const failedJob = runningJob.markFailed(
        error instanceof Error ? error.message : 'Unknown error',
      );
      await this.scrapeJobRepo.save(failedJob);
      throw error;
    }
  }

  private async scrapeRace(catalogEntry: RaceCatalogEntry, year: number): Promise<ParsedResult[]> {
    if (catalogEntry.raceType === RaceType.CLASSIC) {
      return this.scrapeClassic(catalogEntry.slug, year);
    }
    return this.scrapeStageRace(catalogEntry, year);
  }

  private async scrapeClassic(slug: string, year: number): Promise<ParsedResult[]> {
    const path = `race/${slug}/${year}/result`;
    this.logger.log(`Scraping classic: ${path}`);

    const html = await this.pcsClient.fetchPage(path);
    const results = parseClassicResults(html);

    const validation = validateClassificationResults(results, {
      raceSlug: slug,
      classificationType: 'FINAL',
      expectedMinRiders: 80,
      expectedMaxRiders: 250,
    });

    if (!validation.valid) {
      throw new Error(`Validation failed for ${slug}: ${validation.errors.join('; ')}`);
    }

    if (validation.warnings.length > 0) {
      this.logger.warn(`Validation warnings for ${slug}: ${validation.warnings.join('; ')}`);
    }

    return results;
  }

  private async scrapeStageRace(
    catalogEntry: RaceCatalogEntry,
    year: number,
  ): Promise<ParsedResult[]> {
    const gcPath = `race/${catalogEntry.slug}/${year}/gc`;
    this.logger.log(`Scraping stage race GC: ${gcPath}`);

    const gcHtml = await this.pcsClient.fetchPage(gcPath);
    const classificationUrls = extractClassificationUrls(gcHtml);

    const allResults: ParsedResult[] = [];
    const classifications: { type: string; stageNumber?: number }[] = [];

    for (const classUrl of classificationUrls) {
      this.logger.debug(
        `Fetching classification: ${classUrl.classificationType} ${classUrl.urlPath}`,
      );

      const html = await this.pcsClient.fetchPage(classUrl.urlPath);
      const results = this.parseByClassificationType(
        html,
        classUrl.classificationType,
        classUrl.stageNumber,
      );

      const validation = validateClassificationResults(results, {
        raceSlug: catalogEntry.slug,
        classificationType: classUrl.classificationType,
        stageNumber: classUrl.stageNumber ?? undefined,
      });

      if (!validation.valid) {
        this.logger.error(
          `Validation failed for ${catalogEntry.slug} ${classUrl.classificationType}: ${validation.errors.join('; ')}`,
        );
        throw new Error(
          `Validation failed for ${catalogEntry.slug} ${classUrl.classificationType}: ${validation.errors.join('; ')}`,
        );
      }

      if (validation.warnings.length > 0) {
        this.logger.warn(
          `Validation warnings for ${catalogEntry.slug} ${classUrl.classificationType}: ${validation.warnings.join('; ')}`,
        );
      }

      allResults.push(...results);
      classifications.push({
        type: classUrl.classificationType,
        stageNumber: classUrl.stageNumber ?? undefined,
      });
    }

    const completeness = validateStageRaceCompleteness(
      classifications,
      catalogEntry.slug,
      catalogEntry.expectedStages,
    );

    if (!completeness.valid) {
      throw new Error(
        `Stage race completeness failed for ${catalogEntry.slug}: ${completeness.errors.join('; ')}`,
      );
    }

    if (completeness.warnings.length > 0) {
      this.logger.warn(
        `Completeness warnings for ${catalogEntry.slug}: ${completeness.warnings.join('; ')}`,
      );
    }

    return allResults;
  }

  private parseByClassificationType(
    html: string,
    classificationType: string,
    stageNumber: number | null,
  ): ParsedResult[] {
    switch (classificationType) {
      case 'GC':
        return parseGcResults(html);
      case 'STAGE':
        return parseStageResults(html, stageNumber!);
      case 'SPRINT':
        return parseSprintClassification(html);
      case 'MOUNTAIN':
        return parseMountainClassification(html);
      default:
        this.logger.warn(`Unknown classification type: ${classificationType}`);
        return [];
    }
  }

  private async persistResults(
    parsedResults: ParsedResult[],
    catalogEntry: RaceCatalogEntry,
    year: number,
  ): Promise<number> {
    // Upsert unique riders
    const uniqueRiders = new Map<string, ParsedResult>();
    for (const r of parsedResults) {
      if (r.riderSlug && !uniqueRiders.has(r.riderSlug)) {
        uniqueRiders.set(r.riderSlug, r);
      }
    }

    const riderIdMap = new Map<string, string>();

    for (const [slug, parsed] of uniqueRiders) {
      let rider = await this.riderRepo.findByPcsSlug(slug);
      if (rider) {
        if (parsed.teamName && parsed.teamName !== rider.currentTeam) {
          rider = rider.updateTeam(parsed.teamName);
        }
        rider = rider.markScraped();
        await this.riderRepo.save(rider);
      } else {
        rider = Rider.create({
          pcsSlug: slug,
          fullName: parsed.riderName,
          currentTeam: parsed.teamName || null,
          nationality: null,
          lastScrapedAt: new Date(),
        });
        await this.riderRepo.save(rider);
      }
      riderIdMap.set(slug, rider.id);
    }

    // Map to domain RaceResult entities
    const raceResults: RaceResult[] = parsedResults
      .filter((r) => riderIdMap.has(r.riderSlug))
      .map((r) =>
        RaceResult.create({
          riderId: riderIdMap.get(r.riderSlug)!,
          raceSlug: catalogEntry.slug,
          raceName: catalogEntry.name,
          raceType: catalogEntry.raceType,
          raceClass: catalogEntry.raceClass,
          year,
          category: r.category,
          position: r.position,
          stageNumber: r.stageNumber,
          dnf: r.dnf,
          scrapedAt: new Date(),
        }),
      );

    return this.resultRepo.saveMany(raceResults);
  }
}
