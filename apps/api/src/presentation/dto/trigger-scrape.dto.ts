import { IsString, IsInt, Min, Max } from 'class-validator';

export class TriggerScrapeDto {
  @IsString()
  raceSlug!: string;

  @IsInt()
  @Min(2020)
  @Max(2030)
  year!: number;
}
