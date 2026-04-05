import { Inject, Injectable } from '@nestjs/common';
import { RACE_CATALOG_REPOSITORY_PORT, RaceCatalogRepositoryPort } from '../../domain/race-catalog';
import type { RaceType, RaceListResponse } from '@cycling-analyzer/shared-types';

export interface ListRacesInput {
  minYear?: number;
  raceType?: RaceType;
  upcomingOnly?: boolean;
}

@Injectable()
export class ListRacesUseCase {
  constructor(
    @Inject(RACE_CATALOG_REPOSITORY_PORT)
    private readonly raceCatalogRepo: RaceCatalogRepositoryPort,
  ) {}

  async execute(input: ListRacesInput = {}): Promise<RaceListResponse> {
    const minYear = input.minYear ?? 2024;
    const races = await this.raceCatalogRepo.findRaces({
      minYear,
      raceType: input.raceType,
      upcomingOnly: input.upcomingOnly,
    });
    return {
      races: races.map((r) => ({
        raceSlug: r.slug,
        raceName: r.name,
        raceType: r.raceType,
        year: r.year,
      })),
    };
  }
}
