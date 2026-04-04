import { Injectable } from '@nestjs/common';
import type {
  RaceListParserPort,
  DiscoveredRace,
} from '../../application/scraping/ports/race-list-parser.port';
import { parseRaceList } from './parsers/race-list.parser';

@Injectable()
export class RaceListParserAdapter implements RaceListParserPort {
  parseRaceList(html: string): DiscoveredRace[] {
    return parseRaceList(html);
  }
}
