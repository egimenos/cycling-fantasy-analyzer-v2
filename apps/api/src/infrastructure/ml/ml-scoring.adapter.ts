import { Injectable, Logger } from '@nestjs/common';
import {
  MlScoringPort,
  MlPrediction,
  RaceProfileSummary,
} from '../../domain/scoring/ml-scoring.port';

@Injectable()
export class MlScoringAdapter implements MlScoringPort {
  private readonly logger = new Logger(MlScoringAdapter.name);
  private readonly baseUrl: string;
  private readonly timeout = 5000;

  constructor() {
    this.baseUrl = process.env.ML_SERVICE_URL ?? 'http://localhost:8000';
  }

  async predictRace(
    raceSlug: string,
    year: number,
    profileSummary?: RaceProfileSummary,
  ): Promise<MlPrediction[] | null> {
    try {
      const body: Record<string, unknown> = { race_slug: raceSlug, year };
      if (profileSummary) {
        body.profile_summary = profileSummary;
      }
      const response = await fetch(`${this.baseUrl}/predict`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.timeout),
      });
      if (!response.ok) return null;
      const data = (await response.json()) as {
        predictions: Array<{ rider_id: string; predicted_score: number }>;
      };
      return data.predictions.map((p) => ({
        riderId: p.rider_id,
        predictedScore: p.predicted_score,
      }));
    } catch {
      this.logger.warn(`ML service unavailable for predictRace(${raceSlug}, ${year})`);
      return null;
    }
  }

  async getModelVersion(): Promise<string | null> {
    try {
      const resp = await fetch(`${this.baseUrl}/health`, {
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
        signal: AbortSignal.timeout(2000),
      });
      const data = (await resp.json()) as { status?: string };
      return data.status === 'healthy';
    } catch {
      return false;
    }
  }
}
