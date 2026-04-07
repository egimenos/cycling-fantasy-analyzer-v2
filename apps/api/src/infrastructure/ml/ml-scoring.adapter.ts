import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  MlScoringPort,
  MlPrediction,
  MlBreakdown,
  RaceProfileSummary,
} from '../../domain/scoring/ml-scoring.port';
import { CorrelationStore } from '../observability/correlation.store';

const DEFAULT_BREAKDOWN: MlBreakdown = { gc: 0, stage: 0, mountain: 0, sprint: 0 };

@Injectable()
export class MlScoringAdapter implements MlScoringPort {
  private readonly logger = new Logger(MlScoringAdapter.name);
  private readonly baseUrl: string;
  private readonly timeout = 240_000;

  constructor(@Inject(CorrelationStore) private readonly correlationStore: CorrelationStore) {
    this.baseUrl = process.env.ML_SERVICE_URL ?? 'http://localhost:8000';
  }

  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const correlationId = this.correlationStore.getId();
    if (correlationId) {
      headers['x-correlation-id'] = correlationId;
    }
    return headers;
  }

  async predictRace(
    raceSlug: string,
    year: number,
    profileSummary?: RaceProfileSummary,
    riderIds?: string[],
    raceType?: string,
  ): Promise<MlPrediction[] | null> {
    try {
      const body: Record<string, unknown> = { race_slug: raceSlug, year };
      if (profileSummary) {
        body.profile_summary = profileSummary;
      }
      if (riderIds && riderIds.length > 0) {
        body.rider_ids = riderIds;
      }
      if (raceType) {
        body.race_type = raceType;
      }
      const response = await fetch(`${this.baseUrl}/predict`, {
        method: 'POST',
        headers: this.buildHeaders(),
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.timeout),
      });
      if (!response.ok) {
        this.logger.error(
          `ML service returned ${response.status} for predictRace(${raceSlug}, ${year}): ${await response.text().catch(() => 'no body')}`,
        );
        return null;
      }
      const data = (await response.json()) as {
        predictions: Array<{
          rider_id: string;
          predicted_score: number;
          breakdown?: { gc: number; stage: number; mountain: number; sprint: number };
        }>;
      };
      return data.predictions.map((p) => ({
        riderId: p.rider_id,
        predictedScore: p.predicted_score,
        breakdown: p.breakdown ?? DEFAULT_BREAKDOWN,
      }));
    } catch {
      this.logger.warn(`ML service unavailable for predictRace(${raceSlug}, ${year})`);
      return null;
    }
  }

  async getModelVersion(): Promise<string | null> {
    try {
      const resp = await fetch(`${this.baseUrl}/health`, {
        headers: this.buildHeaders(),
        signal: AbortSignal.timeout(2000),
      });
      const data = (await resp.json()) as { model_version?: string };
      return data.model_version ?? null;
    } catch {
      return null;
    }
  }

  async isHealthy(): Promise<boolean> {
    try {
      const resp = await fetch(`${this.baseUrl}/health`, {
        headers: this.buildHeaders(),
        signal: AbortSignal.timeout(2000),
      });
      const data = (await resp.json()) as { status?: string };
      return data.status === 'healthy';
    } catch {
      return false;
    }
  }
}
