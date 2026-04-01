import { Inject, Injectable, Logger } from '@nestjs/common';
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
import { RaceType } from '../../domain/shared/race-type.enum';
import { RaceClass } from '../../domain/shared/race-class.enum';
import { ParcoursType } from '../../domain/shared/parcours-type.enum';
import { PcsScraperPort, PCS_SCRAPER_PORT } from './ports/pcs-scraper.port';
import { extractClassificationUrls } from '../../infrastructure/scraping/parsers/classification-extractor';
import {
  parseGcResults,
  parseStageResults,
  parseMountainClassification,
  parseSprintClassification,
} from '../../infrastructure/scraping/parsers/stage-race.parser';
import { parseClassicResults } from '../../infrastructure/scraping/parsers/classic.parser';
import { parseRaceDate } from '../../infrastructure/scraping/parsers/race-date.parser';
import { ParsedResult } from '../../infrastructure/scraping/parsers/parsed-result.type';
import { parseStageClassifications } from '../../infrastructure/scraping/parsers/stage-classifications.parser';
import {
  validateClassificationResults,
  validateStageRaceCompleteness,
} from '../../infrastructure/scraping/validation/parse-validator';

export interface RaceMetadata {
  readonly name: string;
  readonly raceType: RaceType;
  readonly raceClass: RaceClass;
  readonly expectedStages?: number;
}

export interface TriggerScrapeInput {
  readonly raceSlug: string;
  readonly year: number;
  readonly raceMetadata: RaceMetadata;
}

export interface TriggerScrapeOutput {
  readonly jobId: string;
  readonly status: string;
  readonly recordsUpserted: number;
  readonly warnings: string[];
}

interface ScrapeRaceResult {
  results: ParsedResult[];
  warnings: string[];
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
    const { raceSlug, year, raceMetadata } = input;

    const job = ScrapeJob.create(raceSlug, year);
    await this.scrapeJobRepo.save(job);

    const runningJob = job.markRunning();
    await this.scrapeJobRepo.save(runningJob);

    const startTime = Date.now();
    this.logger.log(`Starting scrape for ${raceSlug} ${year} (${raceMetadata.raceType})`);

    try {
      const scrapeResult = await this.scrapeRace(raceSlug, raceMetadata, year);
      this.logger.log(
        `Parsed ${scrapeResult.results.length} results for ${raceSlug} ${year}, persisting...`,
      );

      const recordsUpserted = await this.persistResults(
        scrapeResult.results,
        raceSlug,
        raceMetadata,
        year,
      );

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      this.logger.log(
        `Completed ${raceSlug} ${year}: ${recordsUpserted} records upserted in ${elapsed}s`,
      );

      const completedJob = runningJob.markSuccess(recordsUpserted);
      await this.scrapeJobRepo.save(completedJob);

      return {
        jobId: job.id,
        status: completedJob.status,
        recordsUpserted,
        warnings: scrapeResult.warnings,
      };
    } catch (error) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      const msg = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed ${raceSlug} ${year} after ${elapsed}s: ${msg}`);

      const failedJob = runningJob.markFailed(msg);
      await this.scrapeJobRepo.save(failedJob);
      throw error;
    }
  }

  private async scrapeRace(
    raceSlug: string,
    metadata: RaceMetadata,
    year: number,
  ): Promise<ScrapeRaceResult> {
    if (metadata.raceType === RaceType.CLASSIC) {
      return this.scrapeClassic(raceSlug, year);
    }
    return this.scrapeStageRace(raceSlug, metadata, year);
  }

  private async scrapeClassic(slug: string, year: number): Promise<ScrapeRaceResult> {
    const path = `race/${slug}/${year}/result`;
    this.logger.log(`Scraping classic: ${path}`);

    const html = await this.pcsClient.fetchPage(path);
    const results = parseClassicResults(html);

    // Extract race date from the result page
    const raceDate = parseRaceDate(html);
    if (!raceDate) {
      this.logger.warn(`Could not extract race date for classic ${slug} ${year}`);
    }

    // Stamp raceDate on all parsed results
    const resultsWithDate = results.map((r) => ({ ...r, raceDate }));

    if (resultsWithDate.length === 0) {
      this.logger.debug(
        `Empty results for ${slug} classic — URL: ${path}, HTML snippet: ${html.slice(0, 500)}`,
      );
    }

    const validation = validateClassificationResults(resultsWithDate, {
      raceSlug: slug,
      classificationType: 'GC',
      expectedMinRiders: 80,
      expectedMaxRiders: 250,
    });

    if (!validation.valid) {
      this.logger.error(`Validation failed for ${slug}: URL ${path}`);
      throw new Error(`Validation failed for ${slug}: ${validation.errors.join('; ')}`);
    }

    if (validation.warnings.length > 0) {
      this.logger.warn(`Validation warnings for ${slug}: ${validation.warnings.join('; ')}`);
    }

    return { results: resultsWithDate, warnings: validation.warnings };
  }

  private async scrapeStageRace(
    raceSlug: string,
    metadata: RaceMetadata,
    year: number,
  ): Promise<ScrapeRaceResult> {
    const gcPath = `race/${raceSlug}/${year}/gc`;
    this.logger.log(`Scraping stage race GC: ${gcPath}`);

    const gcHtml = await this.pcsClient.fetchPage(gcPath);
    const classificationUrls = extractClassificationUrls(gcHtml);

    const allResults: ParsedResult[] = [];
    const classifications: { type: string; stageNumber?: number }[] = [];
    const allWarnings: string[] = [];
    const skippedClassifications: string[] = [];
    let lastStageDate: Date | null = null;

    this.logger.log(`Found ${classificationUrls.length} classifications for ${raceSlug} ${year}`);

    for (let i = 0; i < classificationUrls.length; i++) {
      const classUrl = classificationUrls[i];
      const classLabel =
        classUrl.stageNumber != null
          ? `${classUrl.classificationType} stage ${classUrl.stageNumber}`
          : classUrl.classificationType;

      this.logger.debug(
        `[${i + 1}/${classificationUrls.length}] Fetching ${classLabel}: ${classUrl.urlPath}`,
      );

      const html = await this.pcsClient.fetchPage(classUrl.urlPath);
      const results = this.parseByClassificationType(
        html,
        classUrl.classificationType,
        classUrl.stageNumber,
        classUrl.label,
      );

      this.logger.debug(
        `[${i + 1}/${classificationUrls.length}] ${classLabel}: ${results.length} riders parsed`,
      );

      // Extract race date from each page
      const pageDate = parseRaceDate(html);

      // Track the latest stage date for use on GC/classification results
      if (classUrl.classificationType === 'STAGE' && pageDate) {
        if (!lastStageDate || pageDate.getTime() > lastStageDate.getTime()) {
          lastStageDate = pageDate;
        }
      }

      // Determine the date for these results:
      // - Stage results get their own stage date
      // - GC/classification results get the last stage date (final race day)
      const resultDate = classUrl.classificationType === 'STAGE' ? pageDate : null;

      // Stamp raceDate on all parsed results
      const resultsWithDate = results.map((r) => ({
        ...r,
        raceDate: resultDate,
      }));

      // Handle empty results for non-GC classifications gracefully
      if (resultsWithDate.length === 0 && classUrl.classificationType !== 'GC') {
        const warnMsg = `Empty results for ${raceSlug} ${classLabel} — skipping (suspended/cancelled?)`;
        this.logger.warn(warnMsg);
        this.logger.debug(
          `Empty classification HTML snippet for ${classUrl.urlPath}: ${html.slice(0, 500)}`,
        );
        allWarnings.push(warnMsg);
        skippedClassifications.push(classLabel);
        continue;
      }

      const validation = validateClassificationResults(resultsWithDate, {
        raceSlug,
        classificationType: classUrl.classificationType,
        stageNumber: classUrl.stageNumber ?? undefined,
      });

      if (!validation.valid) {
        this.logger.error(
          `Validation failed for ${raceSlug} ${classLabel}: URL ${classUrl.urlPath} — ${validation.errors.join('; ')}`,
        );
        throw new Error(
          `Validation failed for ${raceSlug} ${classLabel}: ${validation.errors.join('; ')}`,
        );
      }

      if (validation.warnings.length > 0) {
        this.logger.warn(
          `Validation warnings for ${raceSlug} ${classLabel}: ${validation.warnings.join('; ')}`,
        );
        allWarnings.push(...validation.warnings);
      }

      allResults.push(...resultsWithDate);
      classifications.push({
        type: classUrl.classificationType,
        stageNumber: classUrl.stageNumber ?? undefined,
      });

      // For stage pages, also extract daily classifications from hidden tabs
      if (classUrl.classificationType === 'STAGE' && classUrl.stageNumber != null) {
        try {
          const stageClassifications = parseStageClassifications(html, classUrl.stageNumber);

          const classificationResults = [
            ...stageClassifications.dailyGC,
            ...stageClassifications.mountainPasses,
            ...stageClassifications.intermediateSprints,
            ...stageClassifications.dailyRegularidad,
          ];

          // Stamp raceDate on classification results (same date as the stage)
          const classificationResultsWithDate = classificationResults.map((r) => ({
            ...r,
            raceDate: resultDate,
          }));

          const gcCount = stageClassifications.dailyGC.length;
          const mtCount = stageClassifications.mountainPasses.length;
          const spCount = stageClassifications.intermediateSprints.length;
          const rgCount = stageClassifications.dailyRegularidad.length;

          if (classificationResultsWithDate.length > 0) {
            allResults.push(...classificationResultsWithDate);
            this.logger.log(
              `Stage ${classUrl.stageNumber}: ${gcCount} GC daily, ${mtCount} mountain passes, ${spCount} sprints, ${rgCount} regularidad`,
            );
          } else {
            this.logger.warn(
              `Stage ${classUrl.stageNumber}: no daily classifications found (old race or missing tabs)`,
            );
          }
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          this.logger.warn(
            `Stage ${classUrl.stageNumber}: failed to parse daily classifications — ${msg}`,
          );
        }
      }
    }

    // Backfill GC/classification results with the last stage date (final race day)
    if (lastStageDate) {
      for (let i = 0; i < allResults.length; i++) {
        if (allResults[i].raceDate === null) {
          allResults[i] = { ...allResults[i], raceDate: lastStageDate };
        }
      }
    }

    const skippedStageCount = skippedClassifications.filter((c) => c.startsWith('STAGE')).length;

    const completeness = validateStageRaceCompleteness(
      classifications,
      raceSlug,
      metadata.expectedStages,
      skippedStageCount,
    );

    if (!completeness.valid) {
      throw new Error(
        `Stage race completeness failed for ${raceSlug}: ${completeness.errors.join('; ')}`,
      );
    }

    if (completeness.warnings.length > 0) {
      this.logger.warn(
        `Completeness warnings for ${raceSlug}: ${completeness.warnings.join('; ')}`,
      );
      allWarnings.push(...completeness.warnings);
    }

    return { results: allResults, warnings: allWarnings };
  }

  private parseByClassificationType(
    html: string,
    classificationType: string,
    stageNumber: number | null,
    stageNameText?: string,
  ): ParsedResult[] {
    switch (classificationType) {
      case 'GC':
        return parseGcResults(html);
      case 'STAGE':
        return parseStageResults(html, stageNumber!, stageNameText);
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
    raceSlug: string,
    metadata: RaceMetadata,
    year: number,
  ): Promise<number> {
    // Collect unique riders from parsed results
    const uniqueRiders = new Map<string, ParsedResult>();
    for (const r of parsedResults) {
      if (r.riderSlug && !uniqueRiders.has(r.riderSlug)) {
        uniqueRiders.set(r.riderSlug, r);
      }
    }

    this.logger.debug(`Upserting ${uniqueRiders.size} unique riders for ${raceSlug} ${year}`);

    // Batch-fetch existing riders in one query
    const slugs = [...uniqueRiders.keys()];
    const existingRiders = await this.riderRepo.findByPcsSlugs(slugs);
    const existingBySlug = new Map(existingRiders.map((r) => [r.pcsSlug, r]));

    const ridersToSave: Rider[] = [];
    const riderIdMap = new Map<string, string>();
    let newRiders = 0;
    let updatedRiders = 0;

    for (const [slug, parsed] of uniqueRiders) {
      let rider = existingBySlug.get(slug);
      if (rider) {
        if (parsed.teamName && parsed.teamName !== rider.currentTeam) {
          rider = rider.updateTeam(parsed.teamName);
        }
        rider = rider.markScraped();
        updatedRiders++;
      } else {
        rider = Rider.create({
          pcsSlug: slug,
          fullName: parsed.riderName,
          currentTeam: parsed.teamName || null,
          nationality: null,
          birthDate: null,
          lastScrapedAt: new Date(),
        });
        newRiders++;
      }
      ridersToSave.push(rider);
      riderIdMap.set(slug, rider.id);
    }

    // Batch upsert all riders in a single transaction
    await this.riderRepo.saveMany(ridersToSave);

    this.logger.debug(
      `Riders: ${newRiders} created, ${updatedRiders} updated for ${raceSlug} ${year}`,
    );

    // Map to domain RaceResult entities
    const raceResults: RaceResult[] = parsedResults
      .filter((r) => riderIdMap.has(r.riderSlug))
      .map((r) =>
        RaceResult.create({
          riderId: riderIdMap.get(r.riderSlug)!,
          raceSlug: raceSlug,
          raceName: metadata.name,
          raceType: metadata.raceType,
          raceClass: metadata.raceClass,
          year,
          category: r.category,
          position: r.position,
          stageNumber: r.stageNumber,
          dnf: r.dnf,
          scrapedAt: new Date(),
          parcoursType: (r.parcoursType as ParcoursType) ?? null,
          isItt: r.isItt,
          isTtt: r.isTtt,
          profileScore: r.profileScore,
          raceDate: r.raceDate ?? null,
          climbCategory: r.climbCategory ?? null,
          climbName: r.climbName ?? null,
          sprintName: r.sprintName ?? null,
          kmMarker: r.kmMarker ?? null,
        }),
      );

    this.logger.debug(`Saving ${raceResults.length} race results for ${raceSlug} ${year}`);

    return this.resultRepo.saveMany(raceResults);
  }
}
