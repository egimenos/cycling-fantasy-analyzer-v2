import { Module } from '@nestjs/common';
import { ML_SCORING_PORT } from '../../domain/scoring/ml-scoring.port';
import { MlScoringAdapter } from './ml-scoring.adapter';

@Module({
  providers: [
    {
      provide: ML_SCORING_PORT,
      useClass: MlScoringAdapter,
    },
  ],
  exports: [ML_SCORING_PORT],
})
export class MlModule {}
