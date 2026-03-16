import { pgEnum } from 'drizzle-orm/pg-core';

export const raceTypeEnum = pgEnum('race_type', ['grand_tour', 'classic', 'mini_tour']);

export const raceClassEnum = pgEnum('race_class', ['UWT', 'Pro', '1']);

export const resultCategoryEnum = pgEnum('result_category', [
  'gc',
  'stage',
  'mountain',
  'sprint',
  'final',
]);

export const scrapeStatusEnum = pgEnum('scrape_status', [
  'pending',
  'running',
  'success',
  'failed',
]);
