import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PcsScraperPort, PCS_SCRAPER_PORT } from '../scraping/ports/pcs-scraper.port';
import {
  parseRaceOverview,
  ParsedStageInfo,
} from '../../infrastructure/scraping/parsers/race-overview.parser';
import { extractProfile } from '../../infrastructure/scraping/parsers/profile-extractor';
import { RaceType } from '../../domain/shared/race-type.enum';
import { ParcoursType } from '../../domain/shared/parcours-type.enum';
import type {
  RaceProfileResponse,
  StageInfo,
  ProfileSummary,
} from '@cycling-analyzer/shared-types';

const GRAND_TOUR_SLUGS = ['tour-de-france', 'giro-d-italia', 'vuelta-a-espana'];

@Injectable()
export class FetchRaceProfileUseCase {
  constructor(
    @Inject(PCS_SCRAPER_PORT)
    private readonly pcsClient: PcsScraperPort,
  ) {}

  async execute(pcsUrl: string): Promise<RaceProfileResponse> {
    const { raceSlug, year } = this.parseUrl(pcsUrl);
    const raceName = this.slugToName(raceSlug);

    // Try to fetch overview page first (works for stage races)
    const overviewHtml = await this.pcsClient.fetchPage(`race/${raceSlug}/${year}`);
    const stages = parseRaceOverview(overviewHtml);

    if (stages.length > 0) {
      // Stage race — determine if GT or mini-tour
      const raceType = this.detectStageRaceType(raceSlug);
      return this.buildStageRaceResponse(raceSlug, raceName, raceType, year, stages);
    }

    // No stages → classic (one-day race)
    return this.fetchClassicProfile(raceSlug, year, raceName);
  }

  parseUrl(url: string): { raceSlug: string; year: number } {
    // Handle URLs like:
    //   https://www.procyclingstats.com/race/tour-de-france/2025
    //   https://www.procyclingstats.com/race/tour-de-france/2025/
    //   procyclingstats.com/race/tour-de-france/2025
    const match = url.match(/procyclingstats\.com\/race\/([^/]+)\/(\d{4})/);
    if (!match) {
      throw new NotFoundException(`Could not parse race URL: ${url}`);
    }
    return {
      raceSlug: match[1],
      year: parseInt(match[2], 10),
    };
  }

  slugToName(slug: string): string {
    return slug
      .split('-')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  detectStageRaceType(slug: string): RaceType {
    return GRAND_TOUR_SLUGS.includes(slug) ? RaceType.GRAND_TOUR : RaceType.MINI_TOUR;
  }

  private buildStageRaceResponse(
    raceSlug: string,
    raceName: string,
    raceType: RaceType,
    year: number,
    parsedStages: ParsedStageInfo[],
  ): RaceProfileResponse {
    const stages: StageInfo[] = parsedStages.map((s) => ({
      stageNumber: s.stageNumber,
      parcoursType: (s.parcoursType as ParcoursType) ?? null,
      isItt: s.isItt,
      isTtt: s.isTtt,
      distanceKm: s.distanceKm,
      departure: s.departure,
      arrival: s.arrival,
    }));

    return {
      raceSlug,
      raceName,
      raceType,
      year,
      totalStages: stages.length,
      stages,
      profileSummary: this.buildProfileSummary(stages),
    };
  }

  private async fetchClassicProfile(
    raceSlug: string,
    year: number,
    raceName: string,
  ): Promise<RaceProfileResponse> {
    // Try current year result page
    try {
      const html = await this.pcsClient.fetchPage(`race/${raceSlug}/${year}/result`);
      const profile = extractProfile(html);
      if (profile.parcoursType) {
        return this.buildClassicResponse(raceSlug, raceName, year, profile.parcoursType);
      }
    } catch {
      // Page doesn't exist — try fallback
    }

    // Try previous year as fallback (FR-007b)
    try {
      const html = await this.pcsClient.fetchPage(`race/${raceSlug}/${year - 1}/result`);
      const profile = extractProfile(html);
      if (profile.parcoursType) {
        return this.buildClassicResponse(raceSlug, raceName, year, profile.parcoursType);
      }
    } catch {
      // Previous year also failed
    }

    // No profile data available
    throw new NotFoundException(
      `Could not determine profile for ${raceSlug} ${year} or ${year - 1}`,
    );
  }

  private buildClassicResponse(
    raceSlug: string,
    raceName: string,
    year: number,
    parcoursType: string,
  ): RaceProfileResponse {
    const summary: ProfileSummary = {
      p1Count: 0,
      p2Count: 0,
      p3Count: 0,
      p4Count: 0,
      p5Count: 0,
      ittCount: 0,
      tttCount: 0,
      unknownCount: 0,
    };

    // Count the race-level parcours type
    this.incrementParcoursCount(summary, parcoursType, false, false);

    return {
      raceSlug,
      raceName,
      raceType: RaceType.CLASSIC,
      year,
      totalStages: 0,
      stages: [],
      profileSummary: summary,
    };
  }

  private buildProfileSummary(stages: StageInfo[]): ProfileSummary {
    const summary: ProfileSummary = {
      p1Count: 0,
      p2Count: 0,
      p3Count: 0,
      p4Count: 0,
      p5Count: 0,
      ittCount: 0,
      tttCount: 0,
      unknownCount: 0,
    };

    for (const stage of stages) {
      this.incrementParcoursCount(summary, stage.parcoursType, stage.isItt, stage.isTtt);
    }

    return summary;
  }

  private incrementParcoursCount(
    summary: ProfileSummary,
    parcoursType: string | null,
    isItt: boolean,
    isTtt: boolean,
  ): void {
    if (isItt) {
      summary.ittCount++;
      return;
    }
    if (isTtt) {
      summary.tttCount++;
      return;
    }

    switch (parcoursType) {
      case 'p1':
        summary.p1Count++;
        break;
      case 'p2':
        summary.p2Count++;
        break;
      case 'p3':
        summary.p3Count++;
        break;
      case 'p4':
        summary.p4Count++;
        break;
      case 'p5':
        summary.p5Count++;
        break;
      default:
        summary.unknownCount++;
        break;
    }
  }
}
