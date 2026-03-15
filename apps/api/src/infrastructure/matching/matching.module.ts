import { Module } from '@nestjs/common';
import { RIDER_MATCHER_PORT } from '../../domain/matching/rider-matcher.port';
import { FuzzysortMatcherAdapter } from './fuzzysort-matcher.adapter';

const FUZZY_MATCH_THRESHOLD = parseFloat(process.env.FUZZY_MATCH_THRESHOLD ?? '0.3');

@Module({
  providers: [
    {
      provide: RIDER_MATCHER_PORT,
      useFactory: () => new FuzzysortMatcherAdapter(FUZZY_MATCH_THRESHOLD),
    },
  ],
  exports: [RIDER_MATCHER_PORT],
})
export class MatchingModule {}
