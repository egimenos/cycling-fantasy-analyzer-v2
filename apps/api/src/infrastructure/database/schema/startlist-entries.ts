import { pgTable, uuid, varchar, integer, timestamp, unique, index } from 'drizzle-orm/pg-core';
import { riders } from './riders';

export const startlistEntries = pgTable(
  'startlist_entries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    raceSlug: varchar('race_slug', { length: 255 }).notNull(),
    year: integer('year').notNull(),
    riderId: uuid('rider_id')
      .notNull()
      .references(() => riders.id, { onDelete: 'cascade' }),
    teamName: varchar('team_name', { length: 255 }),
    bibNumber: integer('bib_number'),
    scrapedAt: timestamp('scraped_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('startlist_entries_unique').on(table.raceSlug, table.year, table.riderId),
    index('startlist_entries_race_idx').on(table.raceSlug, table.year),
  ],
);
