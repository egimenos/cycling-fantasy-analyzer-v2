import { Inject, Injectable, Logger } from '@nestjs/common';
import { PcsScraperPort, PCS_SCRAPER_PORT } from './ports/pcs-scraper.port';
import {
  RaceListParserPort,
  RACE_LIST_PARSER_PORT,
  DiscoveredRace,
} from './ports/race-list-parser.port';

export { DiscoveredRace };

@Injectable()
export class DiscoverRacesUseCase {
  private readonly logger = new Logger(DiscoverRacesUseCase.name);

  constructor(
    @Inject(PCS_SCRAPER_PORT)
    private readonly pcsClient: PcsScraperPort,
    @Inject(RACE_LIST_PARSER_PORT)
    private readonly parser: RaceListParserPort,
  ) {}

  async execute(year: number, circuits: string[]): Promise<DiscoveredRace[]> {
    const all: DiscoveredRace[] = [];

    for (const circuit of circuits) {
      const url = `races.php?year=${year}&circuit=${circuit}&filter=Filter`;
      this.logger.debug(`Fetching calendar: ${url}`);

      const html = await this.pcsClient.fetchPage(url);
      const races = this.parser.parseRaceList(html);
      all.push(...races);
    }

    return all;
  }
}
