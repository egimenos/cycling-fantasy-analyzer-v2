import { Controller, Get, Query, BadRequestException } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { FetchRaceProfileUseCase } from '../application/analyze/fetch-race-profile.use-case';
import type { RaceProfileResponse } from '@cycling-analyzer/shared-types';
import { assertAllowedHost } from './validation/assert-allowed-host';
import { THROTTLE_EXTERNAL_SCRAPE } from './throttle.constants';

const PCS_ALLOWED_HOSTS = ['procyclingstats.com'];

@Controller('api')
export class RaceProfileController {
  constructor(private readonly fetchRaceProfile: FetchRaceProfileUseCase) {}

  @Get('race-profile')
  @Throttle(THROTTLE_EXTERNAL_SCRAPE)
  async getRaceProfile(@Query('url') url: string): Promise<RaceProfileResponse> {
    if (!url) {
      throw new BadRequestException('url query parameter is required');
    }
    assertAllowedHost(url, PCS_ALLOWED_HOSTS);
    return this.fetchRaceProfile.execute(url);
  }
}
