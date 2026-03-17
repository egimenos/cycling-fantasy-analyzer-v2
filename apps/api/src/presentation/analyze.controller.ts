import { Controller, Post, Body, UsePipes, ValidationPipe } from '@nestjs/common';
import {
  IsString,
  IsNotEmpty,
  IsNumber,
  IsArray,
  IsEnum,
  Min,
  ArrayMinSize,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { RaceType } from '../domain/shared/race-type.enum';
import {
  AnalyzePriceListUseCase,
  AnalyzeResponse,
} from '../application/analyze/analyze-price-list.use-case';

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
}

@Controller('api')
export class AnalyzeController {
  constructor(private readonly analyzeUseCase: AnalyzePriceListUseCase) {}

  @Post('analyze')
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  async analyze(@Body() dto: AnalyzeRequestDto): Promise<AnalyzeResponse> {
    return this.analyzeUseCase.execute({
      riders: dto.riders,
      raceType: dto.raceType,
      budget: dto.budget,
    });
  }
}
