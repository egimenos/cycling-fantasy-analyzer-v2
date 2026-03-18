import { mapPriceListEntries, PriceListEntryDto } from '../price-list-entry';

describe('mapPriceListEntries', () => {
  it('should map valid DTOs to PriceListEntry array', () => {
    const dtos: PriceListEntryDto[] = [
      { name: 'POGACAR Tadej', team: 'UAE Team Emirates', price: 300 },
      { name: 'VINGEGAARD Jonas', team: 'Visma-Lease a Bike', price: 280 },
    ];

    const result = mapPriceListEntries(dtos);

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      rawName: 'POGACAR Tadej',
      rawTeam: 'UAE Team Emirates',
      priceHillios: 300,
    });
    expect(result[1]).toEqual({
      rawName: 'VINGEGAARD Jonas',
      rawTeam: 'Visma-Lease a Bike',
      priceHillios: 280,
    });
  });

  it('should filter out entries with empty name', () => {
    const dtos: PriceListEntryDto[] = [
      { name: '', team: 'Team A', price: 100 },
      { name: 'POGACAR Tadej', team: 'UAE', price: 300 },
    ];

    const result = mapPriceListEntries(dtos);

    expect(result).toHaveLength(1);
    expect(result[0].rawName).toBe('POGACAR Tadej');
  });

  it('should filter out entries with whitespace-only name', () => {
    const dtos: PriceListEntryDto[] = [{ name: '   ', team: 'Team A', price: 100 }];

    const result = mapPriceListEntries(dtos);

    expect(result).toHaveLength(0);
  });

  it('should filter out entries with price <= 0', () => {
    const dtos: PriceListEntryDto[] = [
      { name: 'Rider A', team: 'Team A', price: 0 },
      { name: 'Rider B', team: 'Team B', price: -10 },
      { name: 'Rider C', team: 'Team C', price: 100 },
    ];

    const result = mapPriceListEntries(dtos);

    expect(result).toHaveLength(1);
    expect(result[0].rawName).toBe('Rider C');
  });

  it('should trim whitespace from name and team', () => {
    const dtos: PriceListEntryDto[] = [{ name: '  POGACAR Tadej  ', team: '  UAE  ', price: 300 }];

    const result = mapPriceListEntries(dtos);

    expect(result[0].rawName).toBe('POGACAR Tadej');
    expect(result[0].rawTeam).toBe('UAE');
  });

  it('should preserve empty team as empty string', () => {
    const dtos: PriceListEntryDto[] = [{ name: 'POGACAR Tadej', team: '', price: 300 }];

    const result = mapPriceListEntries(dtos);

    expect(result[0].rawTeam).toBe('');
  });

  it('should return empty array for empty input', () => {
    const result = mapPriceListEntries([]);

    expect(result).toEqual([]);
  });
});
