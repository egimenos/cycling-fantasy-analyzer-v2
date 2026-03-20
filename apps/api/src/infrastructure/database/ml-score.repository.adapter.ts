import { Injectable, Inject } from '@nestjs/common';
import { eq, and, desc } from 'drizzle-orm';
import { MlScoreRepositoryPort } from '../../domain/ml-score/ml-score.repository.port';
import { MlScore } from '../../domain/ml-score/ml-score.entity';
import { mlScores } from './schema/ml-scores';
import { DRIZZLE, DrizzleDatabase } from './drizzle.provider';

@Injectable()
export class MlScoreRepositoryAdapter implements MlScoreRepositoryPort {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDatabase) {}

  async findByRace(raceSlug: string, year: number, modelVersion: string): Promise<MlScore[]> {
    const rows = await this.db
      .select()
      .from(mlScores)
      .where(
        and(
          eq(mlScores.raceSlug, raceSlug),
          eq(mlScores.year, year),
          eq(mlScores.modelVersion, modelVersion),
        ),
      );

    return rows.map((row) => this.toDomain(row));
  }

  async findLatestModelVersion(): Promise<string | null> {
    const rows = await this.db
      .select({ modelVersion: mlScores.modelVersion })
      .from(mlScores)
      .orderBy(desc(mlScores.createdAt))
      .limit(1);

    return rows.length > 0 ? rows[0].modelVersion : null;
  }

  async saveMany(scores: Omit<MlScore, 'id' | 'createdAt'>[]): Promise<void> {
    if (scores.length === 0) return;

    await this.db
      .insert(mlScores)
      .values(
        scores.map((score) => ({
          riderId: score.riderId,
          raceSlug: score.raceSlug,
          year: score.year,
          predictedScore: score.predictedScore,
          modelVersion: score.modelVersion,
        })),
      )
      .onConflictDoNothing();
  }

  private toDomain(row: typeof mlScores.$inferSelect): MlScore {
    return {
      id: row.id,
      riderId: row.riderId,
      raceSlug: row.raceSlug,
      year: row.year,
      predictedScore: row.predictedScore,
      modelVersion: row.modelVersion,
      createdAt: row.createdAt,
    };
  }
}
