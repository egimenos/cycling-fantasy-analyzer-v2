import { pgTable, uuid, varchar, char, timestamp, date } from 'drizzle-orm/pg-core';

export const riders = pgTable('riders', {
  id: uuid('id').primaryKey().defaultRandom(),
  pcsSlug: varchar('pcs_slug', { length: 255 }).notNull().unique(),
  fullName: varchar('full_name', { length: 255 }).notNull(),
  normalizedName: varchar('normalized_name', { length: 255 }).notNull(),
  currentTeam: varchar('current_team', { length: 255 }),
  nationality: char('nationality', { length: 2 }),
  avatarUrl: varchar('avatar_url', { length: 512 }),
  birthDate: date('birth_date', { mode: 'date' }),
  lastScrapedAt: timestamp('last_scraped_at', { withTimezone: true }),
});
