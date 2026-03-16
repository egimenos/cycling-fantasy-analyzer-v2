export interface PriceListEntryDto {
  name: string;
  team: string;
  price: number;
}

export interface PriceListEntry {
  readonly rawName: string;
  readonly rawTeam: string;
  readonly priceHillios: number;
}

export function mapPriceListEntries(dtos: PriceListEntryDto[]): PriceListEntry[] {
  return dtos
    .map((dto) => ({
      rawName: dto.name.trim(),
      rawTeam: dto.team.trim(),
      priceHillios: dto.price,
    }))
    .filter((entry) => entry.rawName !== '' && entry.priceHillios > 0);
}
