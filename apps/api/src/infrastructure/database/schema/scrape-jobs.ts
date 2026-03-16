import { pgTable, uuid, varchar, integer, text, timestamp } from 'drizzle-orm/pg-core';
import { scrapeStatusEnum } from './enums';

export const scrapeJobs = pgTable('scrape_jobs', {
  id: uuid('id').primaryKey().defaultRandom(),
  raceSlug: varchar('race_slug', { length: 255 }).notNull(),
  year: integer('year').notNull(),
  status: scrapeStatusEnum('status').notNull().default('pending'),
  startedAt: timestamp('started_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  errorMessage: text('error_message'),
  recordsUpserted: integer('records_upserted').notNull().default(0),
});
