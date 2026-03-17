import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PcsScraperPort } from '../../../application/scraping/ports/pcs-scraper.port';
import { parseGcResults } from '../parsers/stage-race.parser';
import { parseClassicResults } from '../parsers/classic.parser';
import { validateClassificationResults } from '../validation/parse-validator';
import { HealthStatus } from '../../../domain/shared/health-status.enum';

export interface ParserHealth {
  readonly status: HealthStatus;
  readonly lastCheckAt: Date | null;
  readonly lastError: string | null;
  readonly sampleSize: number;
}

export interface ScraperHealthReport {
  readonly overallStatus: HealthStatus;
  readonly lastCheckAt: Date | null;
  readonly parsers: {
    readonly stageRace: ParserHealth;
    readonly classic: ParserHealth;
  };
}

@Injectable()
export class ScraperHealthService {
  private healthReport: ScraperHealthReport;
  private readonly logger = new Logger(ScraperHealthService.name);

  constructor(private readonly pcsClient: PcsScraperPort) {
    this.healthReport = this.createInitialReport();
  }

  getHealth(): ScraperHealthReport {
    return this.healthReport;
  }

  @Cron('0 */6 * * *')
  async checkHealth(): Promise<void> {
    this.logger.log('Starting scheduled health check');

    const stageRaceHealth = await this.checkStageRaceParser();
    const classicHealth = await this.checkClassicParser();

    const overallStatus = this.computeOverallStatus(stageRaceHealth, classicHealth);

    this.healthReport = {
      overallStatus,
      lastCheckAt: new Date(),
      parsers: {
        stageRace: stageRaceHealth,
        classic: classicHealth,
      },
    };

    if (overallStatus !== HealthStatus.HEALTHY) {
      this.logger.warn(`Scraper health degraded: ${overallStatus}`, this.healthReport);
    }
  }

  private async checkStageRaceParser(): Promise<ParserHealth> {
    try {
      const html = await this.pcsClient.fetchPage('race/tour-de-france/2024/gc');
      const results = parseGcResults(html);

      if (results.length === 0) {
        return {
          status: HealthStatus.DEGRADED,
          lastCheckAt: new Date(),
          lastError: 'Stage race parser returned 0 results',
          sampleSize: 0,
        };
      }

      const validation = validateClassificationResults(results, {
        raceSlug: 'tour-de-france',
        classificationType: 'GC',
        expectedMinRiders: 100,
        expectedMaxRiders: 180,
      });

      if (!validation.valid) {
        return {
          status: HealthStatus.FAILING,
          lastCheckAt: new Date(),
          lastError: validation.errors.join('; '),
          sampleSize: results.length,
        };
      }

      if (validation.warnings.length > 0) {
        return {
          status: HealthStatus.DEGRADED,
          lastCheckAt: new Date(),
          lastError: validation.warnings.join('; '),
          sampleSize: results.length,
        };
      }

      return {
        status: HealthStatus.HEALTHY,
        lastCheckAt: new Date(),
        lastError: null,
        sampleSize: results.length,
      };
    } catch (error) {
      return {
        status: HealthStatus.FAILING,
        lastCheckAt: new Date(),
        lastError: error instanceof Error ? error.message : 'Unknown error',
        sampleSize: 0,
      };
    }
  }

  private async checkClassicParser(): Promise<ParserHealth> {
    try {
      const html = await this.pcsClient.fetchPage('race/milano-sanremo/2024/result');
      const results = parseClassicResults(html);

      if (results.length === 0) {
        return {
          status: HealthStatus.DEGRADED,
          lastCheckAt: new Date(),
          lastError: 'Classic parser returned 0 results',
          sampleSize: 0,
        };
      }

      const validation = validateClassificationResults(results, {
        raceSlug: 'milano-sanremo',
        classificationType: 'FINAL',
        expectedMinRiders: 80,
        expectedMaxRiders: 250,
      });

      if (!validation.valid) {
        return {
          status: HealthStatus.FAILING,
          lastCheckAt: new Date(),
          lastError: validation.errors.join('; '),
          sampleSize: results.length,
        };
      }

      if (validation.warnings.length > 0) {
        return {
          status: HealthStatus.DEGRADED,
          lastCheckAt: new Date(),
          lastError: validation.warnings.join('; '),
          sampleSize: results.length,
        };
      }

      return {
        status: HealthStatus.HEALTHY,
        lastCheckAt: new Date(),
        lastError: null,
        sampleSize: results.length,
      };
    } catch (error) {
      return {
        status: HealthStatus.FAILING,
        lastCheckAt: new Date(),
        lastError: error instanceof Error ? error.message : 'Unknown error',
        sampleSize: 0,
      };
    }
  }

  private computeOverallStatus(stageRace: ParserHealth, classic: ParserHealth): HealthStatus {
    if (stageRace.status === HealthStatus.FAILING || classic.status === HealthStatus.FAILING) {
      return HealthStatus.FAILING;
    }
    if (stageRace.status === HealthStatus.DEGRADED || classic.status === HealthStatus.DEGRADED) {
      return HealthStatus.DEGRADED;
    }
    return HealthStatus.HEALTHY;
  }

  private createInitialReport(): ScraperHealthReport {
    const initial: ParserHealth = {
      status: HealthStatus.HEALTHY,
      lastCheckAt: null,
      lastError: null,
      sampleSize: 0,
    };
    return {
      overallStatus: HealthStatus.HEALTHY,
      lastCheckAt: null,
      parsers: { stageRace: initial, classic: initial },
    };
  }
}
