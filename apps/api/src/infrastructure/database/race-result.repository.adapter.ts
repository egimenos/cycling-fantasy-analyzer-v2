import { Injectable, Inject } from '@nestjs/common';
import { eq, inArray, and, lt, isNotNull, desc } from 'drizzle-orm';
import {
  RaceResultRepositoryPort,
  RaceSummary,
} from '../../domain/race-result/race-result.repository.port';
import { RaceResult, RaceResultProps } from '../../domain/race-result/race-result.entity';
import { RaceType } from '../../domain/shared/race-type.enum';
import { RaceClass } from '../../domain/shared/race-class.enum';
import { ResultCategory } from '../../domain/shared/result-category.enum';
import { ParcoursType } from '../../domain/shared/parcours-type.enum';
import { raceResults } from './schema/race-results';
import { DRIZZLE, DrizzleDatabase } from './drizzle.provider';

@Injectable()
export class RaceResultRepositoryAdapter implements RaceResultRepositoryPort {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDatabase) {}

  async findByRider(riderId: string): Promise<RaceResult[]> {
    const rows = await this.db
      .select()
      .from(raceResults)
      .where(eq(raceResults.riderId, riderId))
      .orderBy(raceResults.year, raceResults.raceSlug);

    return rows.map((row) => this.toDomain(row));
  }

  async findByRiderIds(riderIds: string[]): Promise<RaceResult[]> {
    if (riderIds.length === 0) return [];

    const rows = await this.db
      .select()
      .from(raceResults)
      .where(inArray(raceResults.riderId, riderIds));

    return rows.map((row) => this.toDomain(row));
  }

  async findByRace(raceSlug: string, year: number): Promise<RaceResult[]> {
    const rows = await this.db
      .select()
      .from(raceResults)
      .where(and(eq(raceResults.raceSlug, raceSlug), eq(raceResults.year, year)));

    return rows.map((row) => this.toDomain(row));
  }

  async findByRiderIdsBeforeDate(riderIds: string[], cutoffDate: Date): Promise<RaceResult[]> {
    if (riderIds.length === 0) return [];

    const rows = await this.db
      .select()
      .from(raceResults)
      .where(and(inArray(raceResults.riderId, riderIds), lt(raceResults.raceDate, cutoffDate)));

    return rows.map((row) => this.toDomain(row));
  }

  async findByRiderIdsAndRaceSlug(riderIds: string[], raceSlug: string): Promise<RaceResult[]> {
    if (riderIds.length === 0) return [];

    const rows = await this.db
      .select()
      .from(raceResults)
      .where(and(inArray(raceResults.riderId, riderIds), eq(raceResults.raceSlug, raceSlug)));

    return rows.map((row) => this.toDomain(row));
  }

  async findDistinctRacesWithDate(): Promise<RaceSummary[]> {
    const rows = await this.db
      .selectDistinct({
        raceSlug: raceResults.raceSlug,
        raceName: raceResults.raceName,
        year: raceResults.year,
        raceType: raceResults.raceType,
      })
      .from(raceResults)
      .where(isNotNull(raceResults.raceDate))
      .orderBy(desc(raceResults.year));

    return rows.map((row) => ({
      raceSlug: row.raceSlug,
      raceName: row.raceName,
      year: row.year,
      raceType: row.raceType as RaceType,
    }));
  }

  async saveMany(results: RaceResult[]): Promise<number> {
    if (results.length === 0) return 0;

    let count = 0;

    await this.db.transaction(async (tx) => {
      for (const result of results) {
        const props = result.toProps();
        await tx
          .insert(raceResults)
          .values({
            id: props.id,
            riderId: props.riderId,
            raceSlug: props.raceSlug,
            raceName: props.raceName,
            raceType: props.raceType,
            raceClass: props.raceClass,
            year: props.year,
            category: props.category,
            position: props.position,
            stageNumber: props.stageNumber,
            dnf: props.dnf,
            scrapedAt: props.scrapedAt,
            parcoursType: props.parcoursType,
            isItt: props.isItt,
            isTtt: props.isTtt,
            profileScore: props.profileScore,
            raceDate: props.raceDate,
            climbCategory: props.climbCategory,
            climbName: props.climbName,
            sprintName: props.sprintName,
            kmMarker: props.kmMarker,
          })
          .onConflictDoUpdate({
            target: [
              raceResults.riderId,
              raceResults.raceSlug,
              raceResults.year,
              raceResults.category,
              raceResults.stageNumber,
              raceResults.climbName,
              raceResults.sprintName,
            ],
            set: {
              position: props.position,
              dnf: props.dnf,
              scrapedAt: props.scrapedAt,
              parcoursType: props.parcoursType,
              isItt: props.isItt,
              isTtt: props.isTtt,
              profileScore: props.profileScore,
              raceDate: props.raceDate,
              climbCategory: props.climbCategory,
              kmMarker: props.kmMarker,
            },
          });
        count++;
      }
    });

    return count;
  }

  private toDomain(row: typeof raceResults.$inferSelect): RaceResult {
    return RaceResult.reconstitute({
      id: row.id,
      riderId: row.riderId,
      raceSlug: row.raceSlug,
      raceName: row.raceName,
      raceType: row.raceType as RaceType,
      raceClass: row.raceClass as RaceClass,
      year: row.year,
      category: row.category as ResultCategory,
      position: row.position,
      stageNumber: row.stageNumber,
      dnf: row.dnf,
      scrapedAt: row.scrapedAt,
      parcoursType: (row.parcoursType as ParcoursType) ?? null,
      isItt: row.isItt,
      isTtt: row.isTtt,
      profileScore: row.profileScore,
      raceDate: row.raceDate ?? null,
      climbCategory: row.climbCategory ?? null,
      climbName: row.climbName ?? null,
      sprintName: row.sprintName ?? null,
      kmMarker: row.kmMarker ?? null,
    } satisfies RaceResultProps);
  }
}
