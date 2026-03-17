import { pgTable, uuid, varchar, integer, boolean, timestamp, unique } from 'drizzle-orm/pg-core';
import { riders } from './riders';
import { raceTypeEnum, raceClassEnum, resultCategoryEnum } from './enums';

export const raceResults = pgTable(
  'race_results',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    riderId: uuid('rider_id')
      .notNull()
      .references(() => riders.id, { onDelete: 'cascade' }),
    raceSlug: varchar('race_slug', { length: 255 }).notNull(),
    raceName: varchar('race_name', { length: 255 }).notNull(),
    raceType: raceTypeEnum('race_type').notNull(),
    raceClass: raceClassEnum('race_class').notNull(),
    year: integer('year').notNull(),
    category: resultCategoryEnum('category').notNull(),
    position: integer('position'),
    stageNumber: integer('stage_number'),
    dnf: boolean('dnf').notNull().default(false),
    scrapedAt: timestamp('scraped_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('race_results_unique').on(
      table.riderId,
      table.raceSlug,
      table.year,
      table.category,
      table.stageNumber,
    ),
  ],
);
