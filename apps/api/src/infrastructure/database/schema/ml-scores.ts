import {
  pgTable,
  uuid,
  varchar,
  integer,
  real,
  timestamp,
  unique,
  index,
} from 'drizzle-orm/pg-core';
import { riders } from './riders';

export const mlScores = pgTable(
  'ml_scores',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    riderId: uuid('rider_id')
      .notNull()
      .references(() => riders.id, { onDelete: 'cascade' }),
    raceSlug: varchar('race_slug', { length: 255 }).notNull(),
    year: integer('year').notNull(),
    predictedScore: real('predicted_score').notNull(),
    modelVersion: varchar('model_version', { length: 50 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('ml_scores_unique').on(table.riderId, table.raceSlug, table.year, table.modelVersion),
    index('ml_scores_race_version_idx').on(table.raceSlug, table.year, table.modelVersion),
    index('ml_scores_version_idx').on(table.modelVersion),
  ],
);
