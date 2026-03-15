import { Injectable } from '@nestjs/common';
import {
  ScraperHealthService,
  ScraperHealthReport,
} from '../../infrastructure/scraping/health/scraper-health.service';

@Injectable()
export class GetScraperHealthUseCase {
  constructor(private readonly healthService: ScraperHealthService) {}

  execute(): ScraperHealthReport {
    return this.healthService.getHealth();
  }
}
