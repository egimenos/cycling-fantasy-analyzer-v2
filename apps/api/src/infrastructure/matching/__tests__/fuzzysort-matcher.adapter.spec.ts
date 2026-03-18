import { FuzzysortMatcherAdapter } from '../fuzzysort-matcher.adapter';
import { RiderTarget } from '../../../domain/matching/rider-matcher.port';

describe('FuzzysortMatcherAdapter', () => {
  let adapter: FuzzysortMatcherAdapter;

  const sampleRiders: RiderTarget[] = [
    { id: 'r1', normalizedName: 'pogacar tadej', currentTeam: 'uae team emirates' },
    { id: 'r2', normalizedName: 'vingegaard jonas', currentTeam: 'visma-lease a bike' },
    { id: 'r3', normalizedName: 'evenepoel remco', currentTeam: 'soudal quick-step' },
    { id: 'r4', normalizedName: 'van aert wout', currentTeam: 'visma-lease a bike' },
    { id: 'r5', normalizedName: 'van der poel mathieu', currentTeam: 'alpecin-deceuninck' },
  ];

  beforeEach(() => {
    adapter = new FuzzysortMatcherAdapter(0.1);
    adapter.loadRiders(sampleRiders);
  });

  it('should return high confidence for exact name match', async () => {
    const result = await adapter.matchRider('pogacar tadej', '');

    expect(result.matchedRiderId).toBe('r1');
    expect(result.confidence).toBeGreaterThan(0.5);
    expect(result.unmatched).toBe(false);
  });

  it('should match case-insensitively', async () => {
    const result = await adapter.matchRider('POGACAR Tadej', '');

    expect(result.matchedRiderId).toBe('r1');
    expect(result.unmatched).toBe(false);
  });

  it('should handle accent-insensitive matching', async () => {
    const ridersWithAccents: RiderTarget[] = [
      { id: 'r1', normalizedName: 'pogacar tadej', currentTeam: 'uae team emirates' },
    ];
    adapter.loadRiders(ridersWithAccents);

    const result = await adapter.matchRider('POGAČAR Tadej', '');

    expect(result.matchedRiderId).toBe('r1');
    expect(result.unmatched).toBe(false);
  });

  it('should return unmatched for completely unrelated name', async () => {
    const result = await adapter.matchRider('ZZZZZ XXXXX', '');

    expect(result.matchedRiderId).toBeNull();
    expect(result.confidence).toBe(0);
    expect(result.unmatched).toBe(true);
  });

  it('should return unmatched for empty rider pool', async () => {
    adapter.loadRiders([]);

    const result = await adapter.matchRider('POGACAR Tadej', '');

    expect(result.matchedRiderId).toBeNull();
    expect(result.confidence).toBe(0);
    expect(result.unmatched).toBe(true);
  });

  it('should return unmatched for empty query name', async () => {
    const result = await adapter.matchRider('', 'UAE');

    expect(result.matchedRiderId).toBeNull();
    expect(result.unmatched).toBe(true);
  });

  it('should match a single rider in pool', async () => {
    adapter.loadRiders([{ id: 'r1', normalizedName: 'pogacar tadej', currentTeam: 'uae' }]);

    const result = await adapter.matchRider('pogacar', '');

    expect(result.matchedRiderId).toBe('r1');
    expect(result.unmatched).toBe(false);
  });

  it('should respect threshold configuration', async () => {
    const strictAdapter = new FuzzysortMatcherAdapter(0.99);
    strictAdapter.loadRiders(sampleRiders);

    const result = await strictAdapter.matchRider('pog', '');

    expect(result.unmatched).toBe(true);
  });

  it('should distinguish between riders with similar names using different targets', async () => {
    const similarRiders: RiderTarget[] = [
      { id: 'r4', normalizedName: 'van aert wout', currentTeam: 'visma-lease a bike' },
      { id: 'r5', normalizedName: 'van der poel mathieu', currentTeam: 'alpecin-deceuninck' },
    ];
    adapter.loadRiders(similarRiders);

    const result1 = await adapter.matchRider('van aert', '');
    expect(result1.matchedRiderId).toBe('r4');

    const result2 = await adapter.matchRider('van der poel', '');
    expect(result2.matchedRiderId).toBe('r5');
  });
});
