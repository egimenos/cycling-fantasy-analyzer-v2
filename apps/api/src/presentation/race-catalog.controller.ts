import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { ListRacesUseCase } from '../application/analyze/list-races.use-case';
import { GmvAutoImportUseCase } from '../application/analyze/gmv-auto-import.use-case';
import { FetchRaceProfileUseCase } from '../application/analyze/fetch-race-profile.use-case';
import { RaceType } from '../domain/shared/race-type.enum';
import type {
  RaceListResponse,
  GmvMatchResponse,
  RaceProfileResponse,
} from '@cycling-analyzer/shared-types';

@Controller('api')
export class RaceCatalogController {
  constructor(
    private readonly listRaces: ListRacesUseCase,
    private readonly gmvAutoImport: GmvAutoImportUseCase,
    private readonly fetchRaceProfile: FetchRaceProfileUseCase,
  ) {}

  @Get('races')
  async getRaces(
    @Query('minYear') minYear?: string,
    @Query('raceType') raceType?: string,
  ): Promise<RaceListResponse> {
    const parsedYear = minYear ? parseInt(minYear, 10) : undefined;
    if (parsedYear !== undefined && (isNaN(parsedYear) || parsedYear < 2000)) {
      throw new BadRequestException('Invalid minYear parameter');
    }

    const validRaceTypes: string[] = Object.values(RaceType);
    if (raceType && !validRaceTypes.includes(raceType)) {
      throw new BadRequestException(
        `Invalid raceType. Must be one of: ${validRaceTypes.join(', ')}`,
      );
    }

    return this.listRaces.execute({
      minYear: parsedYear,
      raceType: raceType as RaceType | undefined,
    });
  }

  @Get('gmv-match')
  async getGmvMatch(
    @Query('raceSlug') raceSlug?: string,
    @Query('raceName') raceName?: string,
    @Query('year') year?: string,
  ): Promise<GmvMatchResponse> {
    if (!raceSlug || !year) {
      throw new BadRequestException('raceSlug and year are required');
    }

    const parsedYear = parseInt(year, 10);
    if (isNaN(parsedYear)) {
      throw new BadRequestException('Invalid year');
    }

    const name = raceName ?? this.fetchRaceProfile.slugToName(raceSlug);
    return this.gmvAutoImport.execute(raceSlug, name, parsedYear);
  }

  @Get('race-profile-by-slug')
  async getRaceProfileBySlug(
    @Query('raceSlug') raceSlug?: string,
    @Query('year') year?: string,
  ): Promise<RaceProfileResponse> {
    if (!raceSlug || !year) {
      throw new BadRequestException('raceSlug and year are required');
    }

    const parsedYear = parseInt(year, 10);
    if (isNaN(parsedYear)) {
      throw new BadRequestException('Invalid year');
    }

    return this.fetchRaceProfile.executeBySlug(raceSlug, parsedYear);
  }
}
