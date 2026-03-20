import { Injectable, Logger } from '@nestjs/common';
import { MlScoringPort, MlPrediction } from '../../domain/scoring/ml-scoring.port';

@Injectable()
export class MlScoringAdapter implements MlScoringPort {
  private readonly logger = new Logger(MlScoringAdapter.name);
  private readonly baseUrl: string;
  private readonly predictTimeout = 5000;
  private readonly healthTimeout = 2000;

  constructor() {
    this.baseUrl = process.env.ML_SERVICE_URL ?? 'http://localhost:8000';
  }

  async predictRace(raceSlug: string, year: number): Promise<MlPrediction[] | null> {
    try {
      const response = await fetch(`${this.baseUrl}/predict`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ race_slug: raceSlug, year }),
        signal: AbortSignal.timeout(this.predictTimeout),
      });

      if (!response.ok) {
        this.logger.warn(`ML predict returned HTTP ${response.status} for ${raceSlug}/${year}`);
        return null;
      }

      const data = await response.json();
      return data.predictions.map((p: { rider_id: string; predicted_score: number }) => ({
        riderId: p.rider_id,
        predictedScore: p.predicted_score,
      }));
    } catch (error: unknown) {
      this.logger.warn(
        `ML predictRace failed for ${raceSlug}/${year}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }

  async getModelVersion(): Promise<string | null> {
    try {
      const response = await fetch(`${this.baseUrl}/health`, {
        signal: AbortSignal.timeout(this.healthTimeout),
      });

      if (!response.ok) return null;

      const data = await response.json();
      return data.model_version ?? null;
    } catch (error: unknown) {
      this.logger.warn(
        `ML getModelVersion failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }

  async isHealthy(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/health`, {
        signal: AbortSignal.timeout(this.healthTimeout),
      });

      if (!response.ok) return false;

      const data = await response.json();
      return data.status === 'healthy';
    } catch {
      return false;
    }
  }
}
