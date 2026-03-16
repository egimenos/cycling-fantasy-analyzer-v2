import { Module } from '@nestjs/common';
import { OptimizeTeamUseCase } from './optimize-team.use-case';
import { OptimizeController } from '../../presentation/optimize.controller';

@Module({
  controllers: [OptimizeController],
  providers: [OptimizeTeamUseCase],
})
export class OptimizeModule {}
