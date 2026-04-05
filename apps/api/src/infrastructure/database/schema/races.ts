import { pgTable, uuid, varchar, integer, timestamp, date, unique } from 'drizzle-orm/pg-core';
import { raceTypeEnum, raceClassEnum } from './enums';

export const races = pgTable(
  'races',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    slug: varchar('slug', { length: 255 }).notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    raceType: raceTypeEnum('race_type').notNull(),
    raceClass: raceClassEnum('race_class').notNull(),
    year: integer('year').notNull(),
    startDate: date('start_date', { mode: 'string' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique('races_slug_year_unique').on(table.slug, table.year)],
);
