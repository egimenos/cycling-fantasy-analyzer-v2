import { Injectable, Inject, Logger } from '@nestjs/common';
import {
  EmptyPriceListError,
  MlServiceUnavailableError,
  EmptyStartlistError,
  MlPredictionFailedError,
  AnalysisCancelledError,
} from '../../domain/analyze/errors';
import type { ProgressNotifier } from './ports/progress-notifier.port';
import {
  RiderMatcherPort,
  RIDER_MATCHER_PORT,
  RiderTarget,
} from '../../domain/matching/rider-matcher.port';
import {
  RiderRepositoryPort,
  RIDER_REPOSITORY_PORT,
} from '../../domain/rider/rider.repository.port';
import {
  RaceResultRepositoryPort,
  RACE_RESULT_REPOSITORY_PORT,
} from '../../domain/race-result/race-result.repository.port';
import { MlScoringPort, ML_SCORING_PORT } from '../../domain/scoring/ml-scoring.port';
import {
  MlScoreRepositoryPort,
  ML_SCORE_REPOSITORY_PORT,
} from '../../domain/ml-score/ml-score.repository.port';
import { RaceType } from '../../domain/shared/race-type.enum';
import { FetchStartlistUseCase } from '../benchmark/fetch-startlist.use-case';
import { Rider } from '../../domain/rider/rider.entity';
import { mapPriceListEntries, PriceListEntry, PriceListEntryDto } from './price-list-entry';
import type {
  ProfileSummary,
  BreakoutResult,
  RaceHistory,
  SeasonBreakdown,
} from '@cycling-analyzer/shared-types';
import { computeBreakout, computeP75PtsPerHillio } from '../../domain/breakout';
import {
  buildSameRaceHistory,
  buildSeasonBreakdowns,
  buildRacePerformances,
  buildYearlyTotals,
} from '../../domain/scoring/race-history.service';

export interface AnalyzeInput {
  riders: PriceListEntryDto[];
  raceType: RaceType;
  budget: number;
  profileSummary?: ProfileSummary;
  raceSlug?: string;
  year?: number;
}

interface MatchedRiderInfo {
  id: string;
  pcsSlug: string;
  fullName: string;
  currentTeam: string;
  avatarUrl: string | null;
  nationality: string | null;
}

export interface AnalyzedRider {
  rawName: string;
  rawTeam: string;
  priceHillios: number;
  matchedRider: MatchedRiderInfo | null;
  matchConfidence: number;
  unmatched: boolean;
  pointsPerHillio: number | null;
  totalProjectedPts: number | null;
  categoryScores: {
    gc: number;
    stage: number;
    mountain: number;
    sprint: number;
  } | null;
  breakout: BreakoutResult | null;
  sameRaceHistory: RaceHistory[] | null;
  seasonBreakdowns: SeasonBreakdown[] | null;
}

export interface AnalyzeResponse {
  riders: AnalyzedRider[];
  totalSubmitted: number;
  totalMatched: number;
  unmatchedCount: number;
}

@Injectable()
export class AnalyzePriceListUseCase {
  private readonly logger = new Logger(AnalyzePriceListUseCase.name);

  constructor(
    @Inject(RIDER_MATCHER_PORT) private readonly matcher: RiderMatcherPort,
    @Inject(RIDER_REPOSITORY_PORT) private readonly riderRepo: RiderRepositoryPort,
    @Inject(RACE_RESULT_REPOSITORY_PORT) private readonly resultRepo: RaceResultRepositoryPort,
    @Inject(ML_SCORING_PORT) private readonly mlScoring: MlScoringPort,
    @Inject(ML_SCORE_REPOSITORY_PORT) private readonly mlScoreRepo: MlScoreRepositoryPort,
    private readonly fetchStartlist: FetchStartlistUseCase,
  ) {}

  async execute(input: AnalyzeInput, notifier?: ProgressNotifier): Promise<AnalyzeResponse> {
    const entries = mapPriceListEntries(input.riders);

    if (entries.length === 0) {
      throw new EmptyPriceListError();
    }

    // Step 1: matching_riders
    const step1Start = Date.now();
    notifier?.stepStarted('matching_riders');

    const allRiders = await this.riderRepo.findAll();
    const riderMap = new Map<string, Rider>();
    const targets: RiderTarget[] = allRiders.map((r) => {
      riderMap.set(r.id, r);
      return {
        id: r.id,
        normalizedName: r.normalizedName,
        currentTeam: r.currentTeam ?? '',
      };
    });

    this.matcher.loadRiders(targets);

    const matchResults = await Promise.all(
      entries.map(async (entry) => ({
        entry,
        match: await this.matcher.matchRider(entry.rawName, entry.rawTeam),
      })),
    );

    notifier?.stepCompleted('matching_riders', Date.now() - step1Start);

    // Step 2: loading_history
    const step2Start = Date.now();
    notifier?.stepStarted('loading_history');

    const matchedRiderIds = matchResults
      .filter((r) => r.match.matchedRiderId !== null)
      .map((r) => r.match.matchedRiderId as string);

    // Fetch race results for same-race history and BPI computation
    const raceResults =
      matchedRiderIds.length > 0 ? await this.resultRepo.findByRiderIds(matchedRiderIds) : [];

    const resultsByRider = new Map<string, typeof raceResults>();
    for (const result of raceResults) {
      const riderId = result.riderId;
      const existing = resultsByRider.get(riderId);
      if (existing) {
        existing.push(result);
      } else {
        resultsByRider.set(riderId, [result]);
      }
    }

    notifier?.stepCompleted('loading_history', Date.now() - step2Start);

    interface MatchedEntry {
      entry: PriceListEntry;
      matchedRider: MatchedRiderInfo | null;
      matchConfidence: number;
      unmatched: boolean;
    }

    const matchedEntries: MatchedEntry[] = matchResults.map(({ entry, match }) => {
      if (match.unmatched || match.matchedRiderId === null) {
        return {
          entry,
          matchedRider: null,
          matchConfidence: match.confidence,
          unmatched: true,
        };
      }

      const rider = riderMap.get(match.matchedRiderId);
      if (!rider) {
        return {
          entry,
          matchedRider: null,
          matchConfidence: match.confidence,
          unmatched: true,
        };
      }

      return {
        entry,
        matchedRider: {
          id: rider.id,
          pcsSlug: rider.pcsSlug,
          fullName: rider.fullName,
          currentTeam: rider.currentTeam ?? '',
          avatarUrl: rider.avatarUrl,
          nationality: rider.nationality,
        },
        matchConfidence: match.confidence,
        unmatched: false,
      };
    });

    // --- ML prediction enrichment ---
    const mlPredictions = await this.fetchMlPredictions(input, notifier);

    const analyzedRiders: AnalyzedRider[] = matchedEntries.map((s) => {
      if (s.unmatched || !s.matchedRider) {
        return {
          rawName: s.entry.rawName,
          rawTeam: s.entry.rawTeam,
          priceHillios: s.entry.priceHillios,
          matchedRider: s.matchedRider,
          matchConfidence: s.matchConfidence,
          unmatched: s.unmatched,
          pointsPerHillio: null,
          totalProjectedPts: null,
          categoryScores: null,
          breakout: null,
          sameRaceHistory: null,
          seasonBreakdowns: null,
        };
      }

      const riderId = s.matchedRider.id;
      const riderResults = resultsByRider.get(riderId) ?? [];
      const sameRaceHistory = input.raceSlug
        ? buildSameRaceHistory(riderResults, input.raceSlug)
        : null;
      const seasonBreakdowns = buildSeasonBreakdowns(riderResults);

      const mlResult = mlPredictions.get(riderId);
      const totalProjectedPts = mlResult?.score ?? null;
      const categoryScores = mlResult?.breakdown ?? null;
      const pointsPerHillio =
        totalProjectedPts !== null && s.entry.priceHillios > 0
          ? totalProjectedPts / s.entry.priceHillios
          : null;

      return {
        rawName: s.entry.rawName,
        rawTeam: s.entry.rawTeam,
        priceHillios: s.entry.priceHillios,
        matchedRider: s.matchedRider,
        matchConfidence: s.matchConfidence,
        unmatched: false,
        pointsPerHillio,
        totalProjectedPts,
        categoryScores,
        breakout: null,
        sameRaceHistory: sameRaceHistory?.length ? sameRaceHistory : null,
        seasonBreakdowns: seasonBreakdowns.length ? seasonBreakdowns : null,
      };
    });

    // Step 5: breakout_computation
    const step5Start = Date.now();
    notifier?.stepStarted('breakout_computation');

    // --- BPI computation ---
    const p75Pph = computeP75PtsPerHillio(analyzedRiders);
    for (const rider of analyzedRiders) {
      if (rider.unmatched || !rider.matchedRider) continue;
      const riderEntity = riderMap.get(rider.matchedRider.id);
      const riderResults = resultsByRider.get(rider.matchedRider.id) ?? [];
      const racePerformances = buildRacePerformances(riderResults);
      const yearlyTotals = buildYearlyTotals(racePerformances);
      rider.breakout = computeBreakout({
        yearlyTotals,
        racePerformances,
        prediction: rider.totalProjectedPts ?? 0,
        priceHillios: rider.priceHillios,
        birthDate: riderEntity?.birthDate ?? null,
        profileSummary: input.profileSummary,
        p75PtsPerHillio: p75Pph,
        categoryScores: rider.categoryScores,
        sameRaceHistory: rider.sameRaceHistory ?? [],
      });
    }

    notifier?.stepCompleted('breakout_computation', Date.now() - step5Start);

    // Step 6: building_results
    const step6Start = Date.now();
    notifier?.stepStarted('building_results');

    analyzedRiders.sort((a, b) => {
      const scoreA = a.totalProjectedPts;
      const scoreB = b.totalProjectedPts;
      if (scoreA === null && scoreB === null) return 0;
      if (scoreA === null) return 1;
      if (scoreB === null) return -1;
      return scoreB - scoreA;
    });

    const totalMatched = analyzedRiders.filter((r) => !r.unmatched).length;

    const result: AnalyzeResponse = {
      riders: analyzedRiders,
      totalSubmitted: entries.length,
      totalMatched,
      unmatchedCount: entries.length - totalMatched,
    };

    notifier?.stepCompleted('building_results', Date.now() - step6Start);

    return result;
  }

  /**
   * Fetch ML predictions, using cache when available.
   * Ensures the race has a startlist in DB (scraped from PCS) so the ML
   * service can discover riders from its own data — no synthetic riderIds.
   */
  private async fetchMlPredictions(
    input: AnalyzeInput,
    notifier?: ProgressNotifier,
  ): Promise<
    Map<
      string,
      {
        score: number;
        breakdown: { gc: number; stage: number; mountain: number; sprint: number } | null;
      }
    >
  > {
    if (!input.raceSlug || !input.year) {
      throw new MlServiceUnavailableError();
    }

    const modelVersion = await this.mlScoring.getModelVersion();
    if (!modelVersion) {
      throw new MlServiceUnavailableError();
    }

    // Check cache first
    const cached = await this.mlScoreRepo.findByRace(input.raceSlug!, input.year!, modelVersion);
    if (cached.length > 0) {
      this.logger.debug(
        `ML cache hit for ${input.raceSlug}/${input.year} (model ${modelVersion}, ${cached.length} predictions)`,
      );

      // Emit steps 3 & 4 instantly for cache hits
      const step3Start = Date.now();
      notifier?.stepStarted('fetching_startlist');
      notifier?.stepCompleted('fetching_startlist', Date.now() - step3Start);

      const step4Start = Date.now();
      notifier?.stepStarted('ml_predictions');
      notifier?.stepCompleted('ml_predictions', Date.now() - step4Start);

      return new Map(
        cached.map((s) => [
          s.riderId,
          {
            score: s.predictedScore,
            breakdown:
              s.gcPts || s.stagePts || s.mountainPts || s.sprintPts
                ? {
                    gc: s.gcPts ?? 0,
                    stage: s.stagePts ?? 0,
                    mountain: s.mountainPts ?? 0,
                    sprint: s.sprintPts ?? 0,
                  }
                : null,
          },
        ]),
      );
    }

    // Step 3: fetching_startlist
    const step3Start = Date.now();
    notifier?.stepStarted('fetching_startlist');

    // Scrape the startlist from PCS and persist it in DB. The ML service reads
    // startlists from DB to discover which riders to predict for — we never
    // pass synthetic riderIds (that inflates rider count and breaks scaling).
    // The persisted startlist is also reused for benchmarks and future training.
    const { entries: startlistEntries } = await this.fetchStartlist.execute({
      raceSlug: input.raceSlug!,
      year: input.year!,
    });
    if (startlistEntries.length === 0) {
      throw new EmptyStartlistError(input.raceSlug!, input.year!);
    }
    this.logger.log(
      `Startlist ready for ${input.raceSlug}/${input.year}: ${startlistEntries.length} riders`,
    );

    notifier?.stepCompleted('fetching_startlist', Date.now() - step3Start);

    // Cancellation check before the most expensive operation
    if (notifier?.isCancelled) {
      throw new AnalysisCancelledError();
    }

    // Step 4: ml_predictions
    const step4Start = Date.now();
    notifier?.stepStarted('ml_predictions');

    // Cache miss — call ML service (pass race profile for v4 features)
    const profileForMl = input.profileSummary
      ? {
          p1: input.profileSummary.p1Count ?? 0,
          p2: input.profileSummary.p2Count ?? 0,
          p3: input.profileSummary.p3Count ?? 0,
          p4: input.profileSummary.p4Count ?? 0,
          p5: input.profileSummary.p5Count ?? 0,
          itt: input.profileSummary.ittCount ?? 0,
          ttt: input.profileSummary.tttCount ?? 0,
        }
      : undefined;
    const predictions = await this.mlScoring.predictRace(
      input.raceSlug,
      input.year,
      profileForMl,
      undefined,
      input.raceType,
    );
    if (!predictions) {
      this.logger.error(
        `ML prediction failed for ${input.raceSlug}/${input.year} ` +
          `(raceType=${input.raceType}, startlist=${startlistEntries.length}) — ` +
          `ML service returned no predictions`,
      );
      throw new MlPredictionFailedError(input.raceSlug!, input.year!);
    }

    notifier?.stepCompleted('ml_predictions', Date.now() - step4Start);

    this.logger.log(
      `ML predictions received for ${input.raceSlug}/${input.year}: ${predictions.length} riders`,
    );

    // Write to cache (single cache layer — NestJS owns the cache)
    await this.mlScoreRepo
      .saveMany(
        predictions.map((p) => ({
          riderId: p.riderId,
          raceSlug: input.raceSlug!,
          year: input.year!,
          predictedScore: p.predictedScore,
          modelVersion: modelVersion,
          gcPts: p.breakdown?.gc ?? 0,
          stagePts: p.breakdown?.stage ?? 0,
          mountainPts: p.breakdown?.mountain ?? 0,
          sprintPts: p.breakdown?.sprint ?? 0,
        })),
      )
      .catch((err) => this.logger.warn(`Failed to cache ML predictions: ${err.message}`));

    return new Map(
      predictions.map((p) => [
        p.riderId,
        {
          score: p.predictedScore,
          breakdown: p.breakdown ?? null,
        },
      ]),
    );
  }
}
