import { Injectable, Inject } from '@nestjs/common';
import { and, asc, desc, gte, lte, sql } from 'drizzle-orm';
import {
  type CatalogRace,
  type RaceCatalogFilter,
  type RaceCatalogRepositoryPort,
} from '../../domain/race-catalog/race-catalog.repository.port';
import { RaceType } from '../../domain/shared/race-type.enum';
import { RaceClass } from '../../domain/shared/race-class.enum';
import { races } from './schema/races';
import { DRIZZLE, DrizzleDatabase } from './drizzle.provider';
import { eq } from 'drizzle-orm';

const UPCOMING_WINDOW_DAYS = 14;

@Injectable()
export class RaceCatalogRepositoryAdapter implements RaceCatalogRepositoryPort {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDatabase) {}

  async findRaces(filter?: RaceCatalogFilter): Promise<CatalogRace[]> {
    const conditions = [];

    if (filter?.minYear) {
      conditions.push(gte(races.year, filter.minYear));
    }
    if (filter?.raceType) {
      conditions.push(eq(races.raceType, filter.raceType));
    }
    if (filter?.upcomingOnly) {
      const today = sql`CURRENT_DATE`;
      conditions.push(gte(races.startDate, today));
      conditions.push(
        lte(
          races.startDate,
          sql`${today} + interval '${sql.raw(String(UPCOMING_WINDOW_DAYS))} days'`,
        ),
      );
    }

    const rows = await this.db
      .select({
        slug: races.slug,
        name: races.name,
        raceType: races.raceType,
        raceClass: races.raceClass,
        year: races.year,
        startDate: races.startDate,
      })
      .from(races)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(races.year), asc(races.startDate), asc(races.name));

    return rows.map((row) => ({
      slug: row.slug,
      name: row.name,
      raceType: row.raceType as RaceType,
      raceClass: row.raceClass as RaceClass,
      year: row.year,
      startDate: row.startDate,
    }));
  }

  async upsertMany(catalogRaces: CatalogRace[]): Promise<number> {
    if (catalogRaces.length === 0) return 0;

    let count = 0;

    await this.db.transaction(async (tx) => {
      for (const race of catalogRaces) {
        await tx
          .insert(races)
          .values({
            slug: race.slug,
            name: race.name,
            raceType: race.raceType,
            raceClass: race.raceClass,
            year: race.year,
            startDate: race.startDate,
          })
          .onConflictDoUpdate({
            target: [races.slug, races.year],
            set: {
              name: race.name,
              raceType: race.raceType,
              raceClass: race.raceClass,
              startDate: race.startDate,
            },
          });
        count++;
      }
    });

    return count;
  }
}
