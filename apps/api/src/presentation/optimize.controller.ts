import { Controller, Post, Body, HttpException, HttpStatus } from '@nestjs/common';
import {
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ArrayMinSize,
  ValidateNested,
  IsNotEmpty,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  OptimizeTeamUseCase,
  OptimizeResponse,
} from '../application/optimize/optimize-team.use-case';
import {
  InsufficientRidersError,
  BudgetExceededByLockedRidersError,
  ConflictingConstraintsError,
  RiderNotFoundError,
} from '../domain/optimizer/errors';

class CategoryScoresDto {
  @IsNumber()
  gc!: number;

  @IsNumber()
  stage!: number;

  @IsNumber()
  mountain!: number;

  @IsNumber()
  sprint!: number;
}

class ScoredRiderDto {
  @IsString()
  @IsNotEmpty()
  id!: string;

  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsNumber()
  @Min(1)
  priceHillios!: number;

  @IsNumber()
  totalProjectedPts!: number;

  @IsOptional()
  @IsNumber()
  mlPredictedScore?: number;

  @ValidateNested()
  @Type(() => CategoryScoresDto)
  categoryScores!: CategoryScoresDto;
}

class OptimizeRequestDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ScoredRiderDto)
  riders!: ScoredRiderDto[];

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

@Controller('api')
export class OptimizeController {
  constructor(private readonly optimizeUseCase: OptimizeTeamUseCase) {}

  @Post('optimize')
  optimize(@Body() dto: OptimizeRequestDto): OptimizeResponse {
    try {
      return this.optimizeUseCase.execute({
        riders: dto.riders,
        budget: dto.budget,
        mustInclude: dto.mustInclude,
        mustExclude: dto.mustExclude,
      });
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
