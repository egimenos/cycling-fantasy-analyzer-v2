import { Controller, Post, Body, HttpException, HttpStatus } from '@nestjs/common';
import {
  IsArray,
  IsNumber,
  IsString,
  IsBoolean,
  Min,
  ArrayMinSize,
  ValidateNested,
  IsNotEmpty,
  Allow,
} from 'class-validator';
import { Type } from 'class-transformer';
import { OptimizeTeamUseCase } from '../application/optimize/optimize-team.use-case';
import { ScoredRider } from '../domain/optimizer/types';
import {
  InsufficientRidersError,
  BudgetExceededByLockedRidersError,
  ConflictingConstraintsError,
  RiderNotFoundError,
} from '../domain/optimizer/errors';

/* ── DTO: matches shared-types AnalyzedRider ─────────────── */

class AnalyzedRiderDto {
  @IsString()
  @IsNotEmpty()
  rawName!: string;

  @IsString()
  rawTeam!: string;

  @IsNumber()
  @Min(1)
  priceHillios!: number;

  @Allow()
  matchedRider!: unknown;

  @IsNumber()
  matchConfidence!: number;

  @IsBoolean()
  unmatched!: boolean;

  @Allow()
  pointsPerHillio!: number | null;

  @Allow()
  totalProjectedPts!: number | null;

  @Allow()
  categoryScores!: Record<string, number> | null;

  @Allow()
  seasonsUsed!: number | null;

  @Allow()
  seasonBreakdown!: unknown;

  @Allow()
  scoringMethod!: string;

  @Allow()
  mlPredictedScore!: number | null;
}

class OptimizeRequestDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => AnalyzedRiderDto)
  riders!: AnalyzedRiderDto[];

  @IsNumber()
  @Min(1)
  budget!: number;

  @IsArray()
  @IsString({ each: true })
  mustInclude!: string[];

  @IsArray()
  @IsString({ each: true })
  mustExclude!: string[];
}

/* ── Controller ──────────────────────────────────────────── */

@Controller('api')
export class OptimizeController {
  constructor(private readonly optimizeUseCase: OptimizeTeamUseCase) {}

  @Post('optimize')
  optimize(@Body() dto: OptimizeRequestDto) {
    const ridersByName = new Map(dto.riders.map((r) => [r.rawName, r]));

    const scoredRiders: ScoredRider[] = dto.riders
      .filter((r) => !r.unmatched && r.totalProjectedPts != null && r.categoryScores != null)
      .map((r) => ({
        id: r.rawName,
        name: r.rawName,
        priceHillios: r.priceHillios,
        totalProjectedPts: r.totalProjectedPts!,
        mlPredictedScore: r.mlPredictedScore ?? undefined,
        categoryScores: r.categoryScores as ScoredRider['categoryScores'],
      }));

    try {
      const result = this.optimizeUseCase.execute({
        riders: scoredRiders,
        budget: dto.budget,
        mustInclude: dto.mustInclude,
        mustExclude: dto.mustExclude,
      });

      // Map domain ScoredRider back to AnalyzedRider for the frontend
      const toAnalyzed = (r: ScoredRider) => ridersByName.get(r.id)!;

      return {
        optimalTeam: {
          ...result.optimalTeam,
          riders: result.optimalTeam.riders.map(toAnalyzed),
        },
        alternativeTeams: result.alternativeTeams.map((team) => ({
          ...team,
          riders: team.riders.map(toAnalyzed),
        })),
      };
    } catch (error) {
      if (error instanceof ConflictingConstraintsError) {
        throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
      }
      if (error instanceof BudgetExceededByLockedRidersError) {
        throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
      }
      if (error instanceof RiderNotFoundError) {
        throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
      }
      if (error instanceof InsufficientRidersError) {
        throw new HttpException(error.message, HttpStatus.UNPROCESSABLE_ENTITY);
      }
      throw error;
    }
  }
}
