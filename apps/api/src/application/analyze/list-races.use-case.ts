import { Inject, Injectable } from '@nestjs/common';
import {
  RACE_RESULT_REPOSITORY_PORT,
  RaceResultRepositoryPort,
} from '../../domain/race-result/race-result.repository.port';
import type { RaceType, RaceListResponse } from '@cycling-analyzer/shared-types';

export interface ListRacesInput {
  minYear?: number;
  raceType?: RaceType;
}

@Injectable()
export class ListRacesUseCase {
  constructor(
    @Inject(RACE_RESULT_REPOSITORY_PORT)
    private readonly raceResultRepo: RaceResultRepositoryPort,
  ) {}

  async execute(input: ListRacesInput = {}): Promise<RaceListResponse> {
    const minYear = input.minYear ?? 2024;
    const races = await this.raceResultRepo.findDistinctRacesWithDate({
      minYear,
      raceType: input.raceType,
    });
    return { races };
  }
}
