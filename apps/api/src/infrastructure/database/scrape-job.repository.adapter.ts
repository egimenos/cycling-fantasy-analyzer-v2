import { Injectable, Inject } from '@nestjs/common';
import { eq, and, lt, sql } from 'drizzle-orm';
import { ScrapeJobRepositoryPort } from '../../domain/scrape-job/scrape-job.repository.port';
import { ScrapeJob, ScrapeJobProps } from '../../domain/scrape-job/scrape-job.entity';
import { ScrapeStatus } from '../../domain/shared/scrape-status.enum';
import { scrapeJobs } from './schema/scrape-jobs';
import { DRIZZLE, DrizzleDatabase } from './drizzle.provider';

@Injectable()
export class ScrapeJobRepositoryAdapter implements ScrapeJobRepositoryPort {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDatabase) {}

  async save(job: ScrapeJob): Promise<void> {
    const props = job.toProps();
    await this.db
      .insert(scrapeJobs)
      .values({
        id: props.id,
        raceSlug: props.raceSlug,
        year: props.year,
        status: props.status,
        startedAt: props.startedAt,
        completedAt: props.completedAt,
        errorMessage: props.errorMessage,
        recordsUpserted: props.recordsUpserted,
      })
      .onConflictDoUpdate({
        target: scrapeJobs.id,
        set: {
          status: props.status,
          startedAt: props.startedAt,
          completedAt: props.completedAt,
          errorMessage: props.errorMessage,
          recordsUpserted: props.recordsUpserted,
        },
      });
  }

  async findById(id: string): Promise<ScrapeJob | null> {
    const rows = await this.db.select().from(scrapeJobs).where(eq(scrapeJobs.id, id)).limit(1);

    if (rows.length === 0) return null;
    return this.toDomain(rows[0]);
  }

  async findRecent(limit: number, status?: string): Promise<ScrapeJob[]> {
    const query = this.db.select().from(scrapeJobs);

    const rows = status
      ? await query
          .where(eq(scrapeJobs.status, status as ScrapeStatus))
          .orderBy(sql`${scrapeJobs.startedAt} DESC NULLS LAST`)
          .limit(limit)
      : await query.orderBy(sql`${scrapeJobs.startedAt} DESC NULLS LAST`).limit(limit);

    return rows.map((row) => this.toDomain(row));
  }

  async findStale(olderThanMinutes: number): Promise<ScrapeJob[]> {
    const threshold = new Date(Date.now() - olderThanMinutes * 60 * 1000);

    const rows = await this.db
      .select()
      .from(scrapeJobs)
      .where(and(eq(scrapeJobs.status, ScrapeStatus.RUNNING), lt(scrapeJobs.startedAt, threshold)));

    return rows.map((row) => this.toDomain(row));
  }

  private toDomain(row: typeof scrapeJobs.$inferSelect): ScrapeJob {
    return ScrapeJob.reconstitute({
      id: row.id,
      raceSlug: row.raceSlug,
      year: row.year,
      status: row.status as ScrapeStatus,
      startedAt: row.startedAt,
      completedAt: row.completedAt,
      errorMessage: row.errorMessage,
      recordsUpserted: row.recordsUpserted,
    } satisfies ScrapeJobProps);
  }
}
