import { Controller, Post, Get, Query, Body, BadRequestException } from '@nestjs/common';
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
import { RaceType } from '../domain/shared/race-type.enum';
import {
  AnalyzePriceListUseCase,
  AnalyzeResponse,
} from '../application/analyze/analyze-price-list.use-case';
import {
  ImportPriceListUseCase,
  ParsedPriceEntry,
} from '../application/analyze/import-price-list.use-case';

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
  async analyze(@Body() dto: AnalyzeRequestDto): Promise<AnalyzeResponse> {
    return this.analyzeUseCase.execute({
      riders: dto.riders,
      raceType: dto.raceType,
      budget: dto.budget,
      profileSummary: dto.profileSummary,
      raceSlug: dto.raceSlug,
      year: dto.year,
    });
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
