import { Inject, Injectable } from '@nestjs/common';
import {
  RaceResultRepositoryPort,
  RaceSummary,
  RACE_RESULT_REPOSITORY_PORT,
} from '../../domain/race-result/race-result.repository.port';

@Injectable()
export class ListBenchmarkRacesUseCase {
  constructor(
    @Inject(RACE_RESULT_REPOSITORY_PORT)
    private readonly raceResultRepo: RaceResultRepositoryPort,
  ) {}

  async execute(): Promise<RaceSummary[]> {
    return this.raceResultRepo.findDistinctRacesWithDate();
  }
}
