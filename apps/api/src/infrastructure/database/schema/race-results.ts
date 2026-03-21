import {
  pgTable,
  uuid,
  varchar,
  integer,
  boolean,
  timestamp,
  date,
  real,
  unique,
} from 'drizzle-orm/pg-core';
import { riders } from './riders';
import { raceTypeEnum, raceClassEnum, resultCategoryEnum, parcoursTypeEnum } from './enums';

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
    parcoursType: parcoursTypeEnum('parcours_type'),
    isItt: boolean('is_itt').notNull().default(false),
    isTtt: boolean('is_ttt').notNull().default(false),
    profileScore: integer('profile_score'),
    raceDate: date('race_date', { mode: 'date' }),
    climbCategory: varchar('climb_category', { length: 4 }),
    climbName: varchar('climb_name', { length: 100 }),
    sprintName: varchar('sprint_name', { length: 100 }),
    kmMarker: real('km_marker'),
  },
  (table) => [
    unique('race_results_unique')
      .on(
        table.riderId,
        table.raceSlug,
        table.year,
        table.category,
        table.stageNumber,
        table.climbName,
        table.sprintName,
      )
      .nullsNotDistinct(),
  ],
);
