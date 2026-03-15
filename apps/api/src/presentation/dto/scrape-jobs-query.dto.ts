import { IsOptional, IsInt, Min, Max, IsEnum } from 'class-validator';
import { Type } from 'class-transformer';
import { ScrapeStatus } from '../../domain/shared/scrape-status.enum';

export class ScrapeJobsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @IsOptional()
  @IsEnum(ScrapeStatus)
  status?: ScrapeStatus;
}
