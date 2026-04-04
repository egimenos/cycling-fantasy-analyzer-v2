import { Injectable } from '@nestjs/common';
import type {
  RaceProfileParserPort,
  ParsedStageInfo,
  ExtractedProfile,
} from '../../application/analyze/ports/race-profile-parser.port';
import { parseRaceOverview } from './parsers/race-overview.parser';
import { extractProfile } from './parsers/profile-extractor';

@Injectable()
export class RaceProfileParserAdapter implements RaceProfileParserPort {
  parseRaceOverview(html: string): ParsedStageInfo[] {
    return parseRaceOverview(html);
  }

  extractProfile(html: string): ExtractedProfile {
    return extractProfile(html);
  }
}
