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
import {
  ScoringService,
  CompositeRiderScore,
  SeasonBreakdown,
} from '../../domain/scoring/scoring.service';
import { RaceType } from '../../domain/shared/race-type.enum';
import { ProfileDistribution } from '../../domain/scoring/profile-distribution';
import { Rider } from '../../domain/rider/rider.entity';
import { mapPriceListEntries, PriceListEntry, PriceListEntryDto } from './price-list-entry';
import type { ProfileSummary } from '@cycling-analyzer/shared-types';

export interface AnalyzeInput {
  riders: PriceListEntryDto[];
  raceType: RaceType;
  budget: number;
  seasons?: number;
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
  compositeScore: number | null;
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
    const maxSeasons = input.seasons ?? 3;
    const profileDistribution = input.profileSummary
      ? ProfileDistribution.fromProfileSummary(input.profileSummary)
      : null;

    interface ScoredEntry {
      entry: PriceListEntry;
      matchedRider: MatchedRiderInfo | null;
      matchConfidence: number;
      unmatched: boolean;
      composite: CompositeRiderScore | null;
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
          composite: null,
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
          composite: null,
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

    const poolEntries = scoredEntries
      .filter((s) => s.riderScore !== null)
      .map((s) => ({
        totalProjectedPts: s.riderScore!.totalProjectedPts,
        priceHillios: s.entry.priceHillios,
      }));

    const poolStats = this.scoringService.computePoolStats(poolEntries);

    // --- ML prediction enrichment for stage races ---
    const mlPredictions = await this.fetchMlPredictions(input);

    const analyzedRiders: AnalyzedRider[] = scoredEntries.map((s) => {
      if (s.unmatched || s.riderScore === null) {
        return {
          rawName: s.entry.rawName,
          rawTeam: s.entry.rawTeam,
          priceHillios: s.entry.priceHillios,
          matchedRider: s.matchedRider,
          matchConfidence: s.matchConfidence,
          unmatched: s.unmatched,
          compositeScore: null,
          pointsPerHillio: null,
          totalProjectedPts: null,
          categoryScores: null,
          seasonsUsed: null,
          seasonBreakdown: null,
          scoringMethod: 'rules' as const,
          mlPredictedScore: null,
        };
      }

      const composite = this.scoringService.computeCompositeScore(
        s.riderScore,
        s.entry.priceHillios,
        poolStats,
      );

      return {
        rawName: s.entry.rawName,
        rawTeam: s.entry.rawTeam,
        priceHillios: s.entry.priceHillios,
        matchedRider: s.matchedRider,
        matchConfidence: s.matchConfidence,
        unmatched: false,
        compositeScore: composite.compositeScore,
        pointsPerHillio: composite.pointsPerHillio,
        totalProjectedPts: s.riderScore.totalProjectedPts,
        categoryScores: { ...s.riderScore.categoryScores },
        seasonsUsed: s.riderScore.seasonsUsed,
        seasonBreakdown: s.seasonBreakdown,
        scoringMethod: mlPredictions ? ('hybrid' as const) : ('rules' as const),
        mlPredictedScore: mlPredictions?.get(s.matchedRider?.id ?? '') ?? null,
      };
    });

    analyzedRiders.sort((a, b) => {
      if (a.compositeScore === null && b.compositeScore === null) return 0;
      if (a.compositeScore === null) return 1;
      if (b.compositeScore === null) return -1;
      return b.compositeScore - a.compositeScore;
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
  private async fetchMlPredictions(input: AnalyzeInput): Promise<Map<string, number> | null> {
    const isStageRace =
      input.raceType === RaceType.GRAND_TOUR || input.raceType === RaceType.MINI_TOUR;

    if (!isStageRace) {
      return null;
    }

    if (!input.raceSlug || !input.year) {
      this.logger.debug('Stage race without raceSlug/year — skipping ML predictions');
      return null;
    }

    const modelVersion = await this.mlScoring.getModelVersion();
    if (!modelVersion) {
      this.logger.warn('ML service unavailable — falling back to rules-based scoring');
      return null;
    }

    // Check cache first
    const cached = await this.mlScoreRepo.findByRace(input.raceSlug, input.year, modelVersion);
    if (cached.length > 0) {
      this.logger.debug(
        `ML cache hit for ${input.raceSlug}/${input.year} (model ${modelVersion}, ${cached.length} predictions)`,
      );
      return new Map(cached.map((s) => [s.riderId, s.predictedScore]));
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
    const predictions = await this.mlScoring.predictRace(input.raceSlug, input.year, profileForMl);
    if (!predictions) {
      this.logger.warn(
        `ML predictRace returned null for ${input.raceSlug}/${input.year} — falling back to rules-based scoring`,
      );
      return null;
    }

    this.logger.log(
      `ML predictions received for ${input.raceSlug}/${input.year}: ${predictions.length} riders`,
    );
    return new Map(predictions.map((p) => [p.riderId, p.predictedScore]));
  }
}
