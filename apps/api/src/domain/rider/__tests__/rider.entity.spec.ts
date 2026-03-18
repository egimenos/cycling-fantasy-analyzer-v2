import { Rider } from '../rider.entity';

describe('Rider', () => {
  describe('create', () => {
    it('should create a rider with generated id and normalized name', () => {
      const rider = Rider.create({
        pcsSlug: 'tadej-pogacar',
        fullName: 'Tadej Pogačar',
        currentTeam: 'UAE Team Emirates',
        nationality: 'SI',
        lastScrapedAt: null,
      });

      expect(rider.id).toBeDefined();
      expect(rider.id).toHaveLength(36);
      expect(rider.pcsSlug).toBe('tadej-pogacar');
      expect(rider.fullName).toBe('Tadej Pogačar');
      expect(rider.normalizedName).toBe('tadej pogacar');
      expect(rider.currentTeam).toBe('UAE Team Emirates');
      expect(rider.nationality).toBe('SI');
      expect(rider.lastScrapedAt).toBeNull();
    });
  });

  describe('reconstitute', () => {
    it('should hydrate a rider from props', () => {
      const props = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        pcsSlug: 'jonas-vingegaard',
        fullName: 'Jonas Vingegaard',
        normalizedName: 'jonas vingegaard',
        currentTeam: 'Visma-Lease a Bike',
        nationality: 'DK',
        lastScrapedAt: new Date('2024-07-01'),
      };

      const rider = Rider.reconstitute(props);
      expect(rider.id).toBe(props.id);
      expect(rider.fullName).toBe('Jonas Vingegaard');
      expect(rider.lastScrapedAt).toEqual(new Date('2024-07-01'));
    });
  });

  describe('updateTeam', () => {
    it('should return a new rider with updated team', () => {
      const rider = Rider.create({
        pcsSlug: 'tadej-pogacar',
        fullName: 'Tadej Pogačar',
        currentTeam: 'UAE Team Emirates',
        nationality: 'SI',
        lastScrapedAt: null,
      });

      const updated = rider.updateTeam('UAE Team Emirates-XRG');
      expect(updated.currentTeam).toBe('UAE Team Emirates-XRG');
      expect(updated.id).toBe(rider.id);
      expect(rider.currentTeam).toBe('UAE Team Emirates');
    });
  });

  describe('markScraped', () => {
    it('should return a new rider with lastScrapedAt set', () => {
      const rider = Rider.create({
        pcsSlug: 'tadej-pogacar',
        fullName: 'Tadej Pogačar',
        currentTeam: null,
        nationality: null,
        lastScrapedAt: null,
      });

      const now = new Date('2024-07-21T12:00:00Z');
      const scraped = rider.markScraped(now);
      expect(scraped.lastScrapedAt).toEqual(now);
      expect(rider.lastScrapedAt).toBeNull();
    });
  });

  describe('toProps', () => {
    it('should return a copy of all properties', () => {
      const rider = Rider.create({
        pcsSlug: 'remco-evenepoel',
        fullName: 'Remco Evenepoel',
        currentTeam: 'Soudal-QuickStep',
        nationality: 'BE',
        lastScrapedAt: null,
      });

      const props = rider.toProps();
      expect(props.id).toBe(rider.id);
      expect(props.pcsSlug).toBe('remco-evenepoel');
      expect(props.normalizedName).toBe('remco evenepoel');
    });
  });

  describe('normalizeName', () => {
    it('should strip accents and lowercase', () => {
      const rider = Rider.create({
        pcsSlug: 'test',
        fullName: 'Egan Bernal',
        currentTeam: null,
        nationality: null,
        lastScrapedAt: null,
      });
      expect(rider.normalizedName).toBe('egan bernal');
    });

    it('should handle complex diacritics', () => {
      const rider = Rider.create({
        pcsSlug: 'test',
        fullName: 'Naïro Quintana',
        currentTeam: null,
        nationality: null,
        lastScrapedAt: null,
      });
      expect(rider.normalizedName).toBe('nairo quintana');
    });
  });
});
