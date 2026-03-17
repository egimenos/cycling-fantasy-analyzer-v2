import { Injectable, Inject } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { RiderRepositoryPort } from '../../domain/rider/rider.repository.port';
import { Rider, RiderProps } from '../../domain/rider/rider.entity';
import { riders } from './schema/riders';
import { DRIZZLE, DrizzleDatabase } from './drizzle.provider';

@Injectable()
export class RiderRepositoryAdapter implements RiderRepositoryPort {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDatabase) {}

  async findByPcsSlug(pcsSlug: string): Promise<Rider | null> {
    const rows = await this.db.select().from(riders).where(eq(riders.pcsSlug, pcsSlug)).limit(1);

    if (rows.length === 0) return null;
    return this.toDomain(rows[0]);
  }

  async findAll(): Promise<Rider[]> {
    const rows = await this.db.select().from(riders).orderBy(riders.fullName);

    return rows.map((row) => this.toDomain(row));
  }

  async save(rider: Rider): Promise<void> {
    const props = rider.toProps();
    await this.db
      .insert(riders)
      .values({
        id: props.id,
        pcsSlug: props.pcsSlug,
        fullName: props.fullName,
        normalizedName: props.normalizedName,
        currentTeam: props.currentTeam,
        nationality: props.nationality,
        lastScrapedAt: props.lastScrapedAt,
      })
      .onConflictDoUpdate({
        target: riders.pcsSlug,
        set: {
          fullName: props.fullName,
          normalizedName: props.normalizedName,
          currentTeam: props.currentTeam,
          nationality: props.nationality,
          lastScrapedAt: props.lastScrapedAt,
        },
      });
  }

  private toDomain(row: typeof riders.$inferSelect): Rider {
    return Rider.reconstitute({
      id: row.id,
      pcsSlug: row.pcsSlug,
      fullName: row.fullName,
      normalizedName: row.normalizedName,
      currentTeam: row.currentTeam,
      nationality: row.nationality,
      lastScrapedAt: row.lastScrapedAt,
    } satisfies RiderProps);
  }
}
