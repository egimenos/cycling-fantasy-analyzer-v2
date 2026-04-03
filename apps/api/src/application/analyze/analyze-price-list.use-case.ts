import { Injectable, Inject, Logger, UnprocessableEntityException } from '@nestjs/common';
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
import { ScoringService, SeasonBreakdown } from '../../domain/scoring/scoring.service';
import { RaceType } from '../../domain/shared/race-type.enum';
import { ProfileDistribution } from '../../domain/scoring/profile-distribution';
import { Rider } from '../../domain/rider/rider.entity';
import { mapPriceListEntries, PriceListEntry, PriceListEntryDto } from './price-list-entry';
import type { ProfileSummary, BreakoutResult, RaceHistory } from '@cycling-analyzer/shared-types';
import { computeBreakout, computeMedianPtsPerHillio } from '../../domain/breakout';
import { RaceResult } from '../../domain/race-result/race-result.entity';
import { ResultCategory } from '../../domain/shared/result-category.enum';
import { getPointsForPosition } from '../../domain/scoring/scoring-weights.config';

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
  seasonsUsed: number | null;
  seasonBreakdown: SeasonBreakdown[] | null;
  scoringMethod: 'rules' | 'hybrid';
  mlPredictedScore: number | null;
  mlBreakdown: { gc: number; stage: number; mountain: number; sprint: number } | null;
  breakout: BreakoutResult | null;
  sameRaceHistory: RaceHistory[] | null;
}

export interface AnalyzeResponse {
  riders: AnalyzedRider[];
  totalSubmitted: number;
  totalMatched: number;
  unmatchedCount: number;
}

function countSprintsPerStage(yearResults: readonly RaceResult[]): Map<number, number> {
  const counts = new Map<number, Set<string>>();
  for (const r of yearResults) {
    if (r.category !== ResultCategory.SPRINT_INTERMEDIATE || r.stageNumber === null) continue;
    const existing = counts.get(r.stageNumber);
    const sprintKey = r.sprintName ?? `km${r.kmMarker ?? 0}`;
    if (existing) existing.add(sprintKey);
    else counts.set(r.stageNumber, new Set([sprintKey]));
  }
  const result = new Map<number, number>();
  for (const [stage, names] of counts) result.set(stage, names.size);
  return result;
}

function buildSameRaceHistory(results: readonly RaceResult[], raceSlug: string): RaceHistory[] {
  // Group by year
  const byYear = new Map<number, RaceResult[]>();
  for (const r of results) {
    if (r.raceSlug !== raceSlug) continue;
    const existing = byYear.get(r.year);
    if (existing) existing.push(r);
    else byYear.set(r.year, [r]);
  }

  const history: RaceHistory[] = [];
  for (const [year, yearResults] of byYear) {
    let gc = 0;
    let stage = 0;
    let mountain = 0;
    let sprint = 0;

    const sprintsPerStage = countSprintsPerStage(yearResults);

    for (const r of yearResults) {
      const pts = getPointsForPosition(r.category as ResultCategory, r.position, r.raceType, {
        climbCategory: r.climbCategory,
        sprintCount: r.stageNumber !== null ? (sprintsPerStage.get(r.stageNumber) ?? 1) : 1,
      });
      switch (r.category) {
        case ResultCategory.GC:
        case ResultCategory.GC_DAILY:
        case ResultCategory.REGULARIDAD_DAILY:
          gc += pts;
          break;
        case ResultCategory.STAGE:
          stage += pts;
          break;
        case ResultCategory.MOUNTAIN:
        case ResultCategory.MOUNTAIN_PASS:
          mountain += pts;
          break;
        case ResultCategory.SPRINT:
        case ResultCategory.SPRINT_INTERMEDIATE:
          sprint += pts;
          break;
      }
    }

    history.push({ year, gc, stage, mountain, sprint, total: gc + stage + mountain + sprint });
  }

  return history.sort((a, b) => b.year - a.year);
}

@Injectable()
export class AnalyzePriceListUseCase {
  private readonly logger = new Logger(AnalyzePriceListUseCase.name);

  constructor(
    @Inject(RIDER_MATCHER_PORT) private readonly matcher: RiderMatcherPort,
    @Inject(RIDER_REPOSITORY_PORT) private readonly riderRepo: RiderRepositoryPort,
    @Inject(RACE_RESULT_REPOSITORY_PORT) private readonly resultRepo: RaceResultRepositoryPort,
    private readonly scoringService: ScoringService,
    @Inject(ML_SCORING_PORT) private readonly mlScoring: MlScoringPort,
    @Inject(ML_SCORE_REPOSITORY_PORT) private readonly mlScoreRepo: MlScoreRepositoryPort,
  ) {}

  async execute(input: AnalyzeInput): Promise<AnalyzeResponse> {
    const entries = mapPriceListEntries(input.riders);

    if (entries.length === 0) {
      throw new UnprocessableEntityException('Zero valid riders after filtering');
    }

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

    const matchedRiderIds = matchResults
      .filter((r) => r.match.matchedRiderId !== null)
      .map((r) => r.match.matchedRiderId as string);

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

    const currentYear = new Date().getFullYear();
    const maxSeasons = 5;
    const profileDistribution = input.profileSummary
      ? ProfileDistribution.fromProfileSummary(input.profileSummary)
      : null;

    interface ScoredEntry {
      entry: PriceListEntry;
      matchedRider: MatchedRiderInfo | null;
      matchConfidence: number;
      unmatched: boolean;
      riderScore: ReturnType<ScoringService['computeRiderScore']> | null;
      seasonBreakdown: SeasonBreakdown[] | null;
    }

    const scoredEntries: ScoredEntry[] = matchResults.map(({ entry, match }) => {
      if (match.unmatched || match.matchedRiderId === null) {
        return {
          entry,
          matchedRider: null,
          matchConfidence: match.confidence,
          unmatched: true,
          riderScore: null,
          seasonBreakdown: null,
        };
      }

      const rider = riderMap.get(match.matchedRiderId);
      if (!rider) {
        return {
          entry,
          matchedRider: null,
          matchConfidence: match.confidence,
          unmatched: true,
          riderScore: null,
          seasonBreakdown: null,
        };
      }

      const results = resultsByRider.get(rider.id) ?? [];
      const riderScore = this.scoringService.computeRiderScore(
        rider.id,
        results,
        input.raceType,
        currentYear,
        maxSeasons,
        profileDistribution ?? undefined,
      );
      const seasonBreakdown = this.scoringService.computeSeasonBreakdown(
        results,
        input.raceType,
        currentYear,
        maxSeasons,
      );

      return {
        entry,
        matchedRider: {
          id: rider.id,
          pcsSlug: rider.pcsSlug,
          fullName: rider.fullName,
          currentTeam: rider.currentTeam ?? '',
        },
        matchConfidence: match.confidence,
        unmatched: false,
        composite: null,
        riderScore,
        seasonBreakdown,
      };
    });

    // --- ML prediction enrichment for stage races ---
    const mlPredictions = await this.fetchMlPredictions(input, matchedRiderIds);

    const analyzedRiders: AnalyzedRider[] = scoredEntries.map((s) => {
      if (s.unmatched || s.riderScore === null) {
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
          seasonsUsed: null,
          seasonBreakdown: null,
          scoringMethod: 'rules' as const,
          mlPredictedScore: null,
          mlBreakdown: null,
          breakout: null,
          sameRaceHistory: null,
        };
      }

      const riderId = s.matchedRider?.id ?? '';
      const riderResults = resultsByRider.get(riderId) ?? [];
      const sameRaceHistory = input.raceSlug
        ? buildSameRaceHistory(riderResults, input.raceSlug)
        : null;

      const mlScore = mlPredictions?.get(riderId)?.score ?? null;
      const effectiveScore = mlScore ?? s.riderScore.totalProjectedPts;
      const pointsPerHillio = s.entry.priceHillios > 0 ? effectiveScore / s.entry.priceHillios : 0;

      return {
        rawName: s.entry.rawName,
        rawTeam: s.entry.rawTeam,
        priceHillios: s.entry.priceHillios,
        matchedRider: s.matchedRider,
        matchConfidence: s.matchConfidence,
        unmatched: false,
        pointsPerHillio,
        totalProjectedPts: s.riderScore.totalProjectedPts,
        categoryScores: { ...s.riderScore.categoryScores },
        seasonsUsed: s.riderScore.seasonsUsed,
        seasonBreakdown: s.seasonBreakdown,
        scoringMethod: mlPredictions ? ('hybrid' as const) : ('rules' as const),
        mlPredictedScore: mlScore,
        mlBreakdown: mlPredictions?.get(riderId)?.breakdown ?? null,
        breakout: null,
        sameRaceHistory: sameRaceHistory?.length ? sameRaceHistory : null,
      };
    });

    // --- BPI computation (step 5.5) ---
    const medianPph = computeMedianPtsPerHillio(analyzedRiders);
    for (const rider of analyzedRiders) {
      if (rider.unmatched || !rider.matchedRider) continue;
      const riderEntity = riderMap.get(rider.matchedRider.id);
      rider.breakout = computeBreakout({
        seasonBreakdown: rider.seasonBreakdown ?? [],
        prediction: rider.mlPredictedScore ?? rider.totalProjectedPts ?? 0,
        priceHillios: rider.priceHillios,
        birthDate: riderEntity?.birthDate ?? null,
        profileSummary: input.profileSummary,
        medianPtsPerHillio: medianPph,
        categoryScores: rider.categoryScores,
        sameRaceHistory: rider.sameRaceHistory ?? [],
      });
    }

    analyzedRiders.sort((a, b) => {
      const scoreA = a.mlPredictedScore ?? a.totalProjectedPts;
      const scoreB = b.mlPredictedScore ?? b.totalProjectedPts;
      if (scoreA === null && scoreB === null) return 0;
      if (scoreA === null) return 1;
      if (scoreB === null) return -1;
      return scoreB - scoreA;
    });

    const totalMatched = analyzedRiders.filter((r) => !r.unmatched).length;

    return {
      riders: analyzedRiders,
      totalSubmitted: entries.length,
      totalMatched,
      unmatchedCount: entries.length - totalMatched,
    };
  }

  /**
   * Fetch ML predictions for stage races, using cache when available.
   * Returns a Map<riderId, predictedScore> or null if ML is not applicable/available.
   */
  private async fetchMlPredictions(
    input: AnalyzeInput,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _riderIds: string[],
  ): Promise<Map<
    string,
    {
      score: number;
      breakdown: { gc: number; stage: number; mountain: number; sprint: number } | null;
    }
  > | null> {
    const isMlSupported =
      input.raceType === RaceType.GRAND_TOUR ||
      input.raceType === RaceType.MINI_TOUR ||
      input.raceType === RaceType.CLASSIC;

    if (!isMlSupported) {
      return null;
    }

    if (!input.raceSlug || !input.year) {
      this.logger.debug('Race without raceSlug/year — skipping ML predictions');
      return null;
    }

    const modelVersion = await this.mlScoring.getModelVersion();
    if (!modelVersion) {
      throw new UnprocessableEntityException(
        'ML service is unavailable. Please ensure the ML container is running and try again.',
      );
    }

    // Check cache first
    const cached = await this.mlScoreRepo.findByRace(input.raceSlug!, input.year!, modelVersion);
    if (cached.length > 0) {
      this.logger.debug(
        `ML cache hit for ${input.raceSlug}/${input.year} (model ${modelVersion}, ${cached.length} predictions)`,
      );
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
    // For stage races: don't pass riderIds — let the ML service use its own
    // startlist from DB (passing riderIds corrupts team features).
    // For classics: pass riderIds because classics don't have startlist entries
    // in the DB — the price list is the only source of who's racing.
    const isClassic = input.raceType === RaceType.CLASSIC;
    const predictions = await this.mlScoring.predictRace(
      input.raceSlug,
      input.year,
      profileForMl,
      isClassic ? matchedRiderIds : undefined,
      input.raceType,
    );
    if (!predictions) {
      throw new UnprocessableEntityException(
        `ML prediction failed for ${input.raceSlug}/${input.year}. The ML service could not generate predictions for this race.`,
      );
    }

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
