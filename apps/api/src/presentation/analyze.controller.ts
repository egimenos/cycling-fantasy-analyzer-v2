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
  Max,
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
  parsePriceListPage,
  ParsedPriceEntry,
} from '../infrastructure/scraping/parsers/price-list.parser';

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
  @IsInt()
  @Min(1)
  @Max(5)
  seasons?: number;

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
  constructor(private readonly analyzeUseCase: AnalyzePriceListUseCase) {}

  @Post('analyze')
  async analyze(@Body() dto: AnalyzeRequestDto): Promise<AnalyzeResponse> {
    return this.analyzeUseCase.execute({
      riders: dto.riders,
      raceType: dto.raceType,
      budget: dto.budget,
      seasons: dto.seasons,
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

    const dynamicImport = new Function('specifier', 'return import(specifier)');
    const { gotScraping } = await dynamicImport('got-scraping');
    const response = await gotScraping({
      url: trimmedUrl,
      headerGeneratorOptions: {
        browsers: [{ name: 'chrome', minVersion: 100 }],
        locales: ['es-ES'],
        operatingSystems: ['windows'],
      },
      timeout: { request: 15000 },
    });

    if (response.statusCode !== 200) {
      throw new BadRequestException(`Failed to fetch price list (HTTP ${response.statusCode})`);
    }

    const riders = parsePriceListPage(response.body);
    if (riders.length === 0) {
      throw new BadRequestException('No riders found on the page. Check the URL.');
    }

    return { riders };
  }
}
