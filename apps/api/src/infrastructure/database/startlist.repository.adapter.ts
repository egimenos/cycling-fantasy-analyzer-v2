import { Injectable, Inject } from '@nestjs/common';
import { eq, and } from 'drizzle-orm';
import { StartlistRepositoryPort } from '../../domain/startlist/startlist.repository.port';
import { StartlistEntry, StartlistEntryProps } from '../../domain/startlist/startlist-entry.entity';
import { startlistEntries } from './schema/startlist-entries';
import { DRIZZLE, DrizzleDatabase } from './drizzle.provider';

@Injectable()
export class StartlistRepositoryAdapter implements StartlistRepositoryPort {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDatabase) {}

  async findByRace(raceSlug: string, year: number): Promise<StartlistEntry[]> {
    const rows = await this.db
      .select()
      .from(startlistEntries)
      .where(and(eq(startlistEntries.raceSlug, raceSlug), eq(startlistEntries.year, year)));

    return rows.map((row) => this.toDomain(row));
  }

  async existsForRace(raceSlug: string, year: number): Promise<boolean> {
    const rows = await this.db
      .select({ id: startlistEntries.id })
      .from(startlistEntries)
      .where(and(eq(startlistEntries.raceSlug, raceSlug), eq(startlistEntries.year, year)))
      .limit(1);

    return rows.length > 0;
  }

  async saveMany(entries: StartlistEntry[]): Promise<number> {
    if (entries.length === 0) return 0;

    let count = 0;

    await this.db.transaction(async (tx) => {
      for (const entry of entries) {
        const props = entry.toProps();
        await tx
          .insert(startlistEntries)
          .values({
            id: props.id,
            raceSlug: props.raceSlug,
            year: props.year,
            riderId: props.riderId,
            teamName: props.teamName,
            bibNumber: props.bibNumber,
            scrapedAt: props.scrapedAt,
          })
          .onConflictDoUpdate({
            target: [startlistEntries.raceSlug, startlistEntries.year, startlistEntries.riderId],
            set: {
              teamName: props.teamName,
              bibNumber: props.bibNumber,
              scrapedAt: props.scrapedAt,
            },
          });
        count++;
      }
    });

    return count;
  }

  private toDomain(row: typeof startlistEntries.$inferSelect): StartlistEntry {
    return StartlistEntry.reconstitute({
      id: row.id,
      raceSlug: row.raceSlug,
      year: row.year,
      riderId: row.riderId,
      teamName: row.teamName,
      bibNumber: row.bibNumber,
      scrapedAt: row.scrapedAt,
    } satisfies StartlistEntryProps);
  }
}
