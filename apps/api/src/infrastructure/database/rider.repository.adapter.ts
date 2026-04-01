import { Injectable, Inject } from '@nestjs/common';
import { eq, inArray } from 'drizzle-orm';
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

  async findByPcsSlugs(pcsSlugs: string[]): Promise<Rider[]> {
    if (pcsSlugs.length === 0) return [];

    const rows = await this.db.select().from(riders).where(inArray(riders.pcsSlug, pcsSlugs));

    return rows.map((row) => this.toDomain(row));
  }

  async findByIds(ids: string[]): Promise<Rider[]> {
    if (ids.length === 0) return [];

    const rows = await this.db.select().from(riders).where(inArray(riders.id, ids));

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
        birthDate: props.birthDate,
        lastScrapedAt: props.lastScrapedAt,
      })
      .onConflictDoUpdate({
        target: riders.pcsSlug,
        set: {
          fullName: props.fullName,
          normalizedName: props.normalizedName,
          currentTeam: props.currentTeam,
          nationality: props.nationality,
          birthDate: props.birthDate,
          lastScrapedAt: props.lastScrapedAt,
        },
      });
  }

  async saveMany(riderEntities: Rider[]): Promise<void> {
    if (riderEntities.length === 0) return;

    await this.db.transaction(async (tx) => {
      for (const rider of riderEntities) {
        const props = rider.toProps();
        await tx
          .insert(riders)
          .values({
            id: props.id,
            pcsSlug: props.pcsSlug,
            fullName: props.fullName,
            normalizedName: props.normalizedName,
            currentTeam: props.currentTeam,
            nationality: props.nationality,
            birthDate: props.birthDate,
            lastScrapedAt: props.lastScrapedAt,
          })
          .onConflictDoUpdate({
            target: riders.pcsSlug,
            set: {
              fullName: props.fullName,
              normalizedName: props.normalizedName,
              currentTeam: props.currentTeam,
              nationality: props.nationality,
              birthDate: props.birthDate,
              lastScrapedAt: props.lastScrapedAt,
            },
          });
      }
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
      birthDate: row.birthDate ?? null,
      lastScrapedAt: row.lastScrapedAt,
    } satisfies RiderProps);
  }
}
