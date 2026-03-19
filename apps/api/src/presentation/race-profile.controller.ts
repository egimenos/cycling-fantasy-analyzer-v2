import { Controller, Get, Query, BadRequestException } from '@nestjs/common';
import { FetchRaceProfileUseCase } from '../application/analyze/fetch-race-profile.use-case';
import type { RaceProfileResponse } from '@cycling-analyzer/shared-types';

@Controller('api')
export class RaceProfileController {
  constructor(private readonly fetchRaceProfile: FetchRaceProfileUseCase) {}

  @Get('race-profile')
  async getRaceProfile(@Query('url') url: string): Promise<RaceProfileResponse> {
    if (!url || !url.includes('procyclingstats.com/race/')) {
      throw new BadRequestException('Invalid PCS race URL');
    }
    return this.fetchRaceProfile.execute(url);
  }
}
