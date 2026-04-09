import { Controller, Post, Get, Query, Body, BadRequestException, Req, Res } from '@nestjs/common';
import {
  IsString,
  IsNotEmpty,
  IsNumber,
  IsArray,
  IsEnum,
  IsOptional,
  IsInt,
  Min,
  ArrayMinSize,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { Request, Response } from 'express';
import { RaceType } from '../domain/shared/race-type.enum';
import { AnalyzePriceListUseCase } from '../application/analyze/analyze-price-list.use-case';
import {
  ImportPriceListUseCase,
  ParsedPriceEntry,
} from '../application/analyze/import-price-list.use-case';
import {
  EmptyPriceListError,
  EmptyStartlistError,
  MlServiceUnavailableError,
  MlPredictionFailedError,
  AnalysisCancelledError,
} from '../domain/analyze/errors';
import type { AnalysisStepId } from '@cycling-analyzer/shared-types';
import { SseProgressNotifier } from './sse-progress-notifier';

class PriceListEntryDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  team!: string;

  @IsNumber()
  @Min(1)
  price!: number;
}

class ProfileSummaryDto {
  @IsInt()
  @Min(0)
  p1Count!: number;

  @IsInt()
  @Min(0)
  p2Count!: number;

  @IsInt()
  @Min(0)
  p3Count!: number;

  @IsInt()
  @Min(0)
  p4Count!: number;

  @IsInt()
  @Min(0)
  p5Count!: number;

  @IsInt()
  @Min(0)
  ittCount!: number;

  @IsInt()
  @Min(0)
  tttCount!: number;

  @IsInt()
  @Min(0)
  unknownCount!: number;
}

class AnalyzeRequestDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PriceListEntryDto)
  riders!: PriceListEntryDto[];

  @IsEnum(RaceType)
  raceType!: RaceType;

  @IsNumber()
  @Min(1)
  budget!: number;

  @IsOptional()
  @ValidateNested()
  @Type(() => ProfileSummaryDto)
  profileSummary?: ProfileSummaryDto;

  @IsOptional()
  @IsString()
  raceSlug?: string;

  @IsOptional()
  @IsInt()
  @Min(2000)
  year?: number;
}

@Controller('api')
export class AnalyzeController {
  constructor(
    private readonly analyzeUseCase: AnalyzePriceListUseCase,
    private readonly importPriceListUseCase: ImportPriceListUseCase,
  ) {}

  @Post('analyze')
  async analyze(
    @Body() dto: AnalyzeRequestDto,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const notifier = new SseProgressNotifier(res, req);

    try {
      const result = await this.analyzeUseCase.execute(
        {
          riders: dto.riders,
          raceType: dto.raceType,
          budget: dto.budget,
          profileSummary: dto.profileSummary,
          raceSlug: dto.raceSlug,
          year: dto.year,
        },
        notifier,
      );

      // The use case AnalyzeResponse uses a narrower categoryScores type than shared-types
      // AnalysisResultEvent (which includes all ResultCategory keys). The extra keys are only
      // relevant for detailed scoring; the SSE payload carries the same shape the client expects.
      notifier.sendResult(
        result as unknown as import('@cycling-analyzer/shared-types').AnalysisResultEvent,
      );
    } catch (error) {
      if (error instanceof AnalysisCancelledError) {
        // Client disconnected — silently close
      } else {
        const step = this.mapErrorToStep(error);
        const message = error instanceof Error ? error.message : 'Unknown error';
        notifier.stepFailed(step, message);
      }
    } finally {
      res.end();
    }
  }

  private mapErrorToStep(error: unknown): AnalysisStepId {
    if (error instanceof EmptyPriceListError) return 'matching_riders';
    if (error instanceof EmptyStartlistError) return 'fetching_startlist';
    if (error instanceof MlServiceUnavailableError) return 'ml_predictions';
    if (error instanceof MlPredictionFailedError) return 'ml_predictions';
    return 'building_results';
  }

  @Get('import-price-list')
  async importPriceList(@Query('url') url: string): Promise<{ riders: ParsedPriceEntry[] }> {
    const trimmedUrl = url?.trim();
    if (!trimmedUrl) {
      throw new BadRequestException('url query parameter is required');
    }

    return this.importPriceListUseCase.execute(trimmedUrl);
  }
}
