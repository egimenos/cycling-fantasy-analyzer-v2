import { FetchStartlistUseCase } from '../fetch-startlist.use-case';
import { StartlistRepositoryPort } from '../../../domain/startlist/startlist.repository.port';
import { RiderRepositoryPort } from '../../../domain/rider/rider.repository.port';
import { PcsScraperPort } from '../../scraping/ports/pcs-scraper.port';
import { StartlistParserPort } from '../ports/startlist-parser.port';
import { StartlistEntry } from '../../../domain/startlist/startlist-entry.entity';
import { Rider } from '../../../domain/rider/rider.entity';

describe('FetchStartlistUseCase', () => {
  let useCase: FetchStartlistUseCase;
  let startlistRepo: jest.Mocked<StartlistRepositoryPort>;
  let riderRepo: jest.Mocked<RiderRepositoryPort>;
  let pcsClient: jest.Mocked<PcsScraperPort>;
  let parser: jest.Mocked<StartlistParserPort>;

  beforeEach(() => {
    startlistRepo = {
      findByRace: jest.fn(),
      existsForRace: jest.fn(),
      saveMany: jest.fn(),
    };
    riderRepo = {
      findByPcsSlug: jest.fn(),
      findByPcsSlugs: jest.fn(),
      findByIds: jest.fn(),
      findAll: jest.fn(),
      save: jest.fn(),
      saveMany: jest.fn(),
    };
    pcsClient = {
      fetchPage: jest.fn(),
    };
    parser = {
      parseStartlist: jest.fn().mockReturnValue([]),
    };

    useCase = new FetchStartlistUseCase(startlistRepo, riderRepo, pcsClient, parser);
  });

  describe('cache hit', () => {
    it('returns cached entries without calling PCS', async () => {
      const cachedEntries = [
        StartlistEntry.create({
          raceSlug: 'milano-sanremo',
          year: 2025,
          riderId: 'rider-1',
          teamName: 'Team A',
          bibNumber: 1,
          scrapedAt: new Date('2025-01-01'),
        }),
        StartlistEntry.create({
          raceSlug: 'milano-sanremo',
          year: 2025,
          riderId: 'rider-2',
          teamName: 'Team B',
          bibNumber: 11,
          scrapedAt: new Date('2025-01-01'),
        }),
      ];

      startlistRepo.existsForRace.mockResolvedValue(true);
      startlistRepo.findByRace.mockResolvedValue(cachedEntries);

      const result = await useCase.execute({
        raceSlug: 'milano-sanremo',
        year: 2025,
      });

      expect(result.fromCache).toBe(true);
      expect(result.entries).toHaveLength(2);
      expect(pcsClient.fetchPage).not.toHaveBeenCalled();
      expect(riderRepo.findByPcsSlugs).not.toHaveBeenCalled();
      expect(startlistRepo.saveMany).not.toHaveBeenCalled();
    });
  });

  describe('cache miss', () => {
    it('scrapes PCS, creates riders, and persists startlist entries', async () => {
      startlistRepo.existsForRace.mockResolvedValue(false);

      parser.parseStartlist.mockReturnValue([
        {
          riderName: 'Tadej Pogacar',
          riderSlug: 'tadej-pogacar',
          teamName: 'UAE Team Emirates',
          bibNumber: 1,
        },
        {
          riderName: 'Jonas Vingegaard',
          riderSlug: 'jonas-vingegaard',
          teamName: 'Visma-Lease a Bike',
          bibNumber: 11,
        },
      ]);
      pcsClient.fetchPage.mockResolvedValue('<html></html>');

      // Both riders are new (not in DB)
      riderRepo.findByPcsSlugs.mockResolvedValue([]);
      riderRepo.saveMany.mockResolvedValue(undefined);
      startlistRepo.saveMany.mockResolvedValue(2);

      const result = await useCase.execute({
        raceSlug: 'tour-de-france',
        year: 2025,
      });

      expect(result.fromCache).toBe(false);
      expect(result.entries).toHaveLength(2);

      // Verify PCS was called with the correct path
      expect(pcsClient.fetchPage).toHaveBeenCalledWith('race/tour-de-france/2025/startlist');

      // Verify riders were looked up and saved
      expect(riderRepo.findByPcsSlugs).toHaveBeenCalledWith(['tadej-pogacar', 'jonas-vingegaard']);
      expect(riderRepo.saveMany).toHaveBeenCalledTimes(1);
      const savedRiders = riderRepo.saveMany.mock.calls[0][0];
      expect(savedRiders).toHaveLength(2);
      expect(savedRiders[0].pcsSlug).toBe('tadej-pogacar');
      expect(savedRiders[1].pcsSlug).toBe('jonas-vingegaard');

      // Verify startlist entries were persisted
      expect(startlistRepo.saveMany).toHaveBeenCalledTimes(1);
      const savedEntries = startlistRepo.saveMany.mock.calls[0][0];
      expect(savedEntries).toHaveLength(2);
      expect(savedEntries[0].raceSlug).toBe('tour-de-france');
      expect(savedEntries[0].year).toBe(2025);
    });
  });

  describe('new riders created selectively', () => {
    it('only creates riders that do not exist in DB', async () => {
      startlistRepo.existsForRace.mockResolvedValue(false);

      parser.parseStartlist.mockReturnValue([
        {
          riderName: 'Tadej Pogacar',
          riderSlug: 'tadej-pogacar',
          teamName: 'UAE Team Emirates',
          bibNumber: 1,
        },
        {
          riderName: 'Jonas Vingegaard',
          riderSlug: 'jonas-vingegaard',
          teamName: 'Visma-Lease a Bike',
          bibNumber: 11,
        },
        {
          riderName: 'Primoz Roglic',
          riderSlug: 'primoz-roglic',
          teamName: 'Red Bull-BORA-hansgrohe',
          bibNumber: 21,
        },
      ]);
      pcsClient.fetchPage.mockResolvedValue('<html></html>');

      // Only Pogacar exists in DB
      const existingRider = Rider.create({
        pcsSlug: 'tadej-pogacar',
        fullName: 'Tadej Pogacar',
        currentTeam: 'UAE Team Emirates',
        nationality: null,
        birthDate: null,
        lastScrapedAt: new Date(),
      });
      riderRepo.findByPcsSlugs.mockResolvedValue([existingRider]);
      riderRepo.saveMany.mockResolvedValue(undefined);
      startlistRepo.saveMany.mockResolvedValue(3);

      const result = await useCase.execute({
        raceSlug: 'paris-nice',
        year: 2025,
      });

      expect(result.entries).toHaveLength(3);

      // Only 2 new riders should be saved (Vingegaard and Roglic)
      const savedRiders = riderRepo.saveMany.mock.calls[0][0];
      expect(savedRiders).toHaveLength(2);
      const savedSlugs = savedRiders.map((r: Rider) => r.pcsSlug);
      expect(savedSlugs).toContain('jonas-vingegaard');
      expect(savedSlugs).toContain('primoz-roglic');
      expect(savedSlugs).not.toContain('tadej-pogacar');

      // Existing rider's ID should be used in startlist entries
      const savedEntries = startlistRepo.saveMany.mock.calls[0][0];
      const pogacarEntry = savedEntries.find((e: StartlistEntry) => e.riderId === existingRider.id);
      expect(pogacarEntry).toBeDefined();
    });
  });

  describe('empty startlist', () => {
    it('returns empty entries without persisting', async () => {
      startlistRepo.existsForRace.mockResolvedValue(false);

      // Return HTML with no parseable startlist
      pcsClient.fetchPage.mockResolvedValue('<html><body></body></html>');

      const result = await useCase.execute({
        raceSlug: 'some-race',
        year: 2025,
      });

      expect(result.fromCache).toBe(false);
      expect(result.entries).toHaveLength(0);

      // No rider or startlist persistence should occur
      expect(riderRepo.findByPcsSlugs).not.toHaveBeenCalled();
      expect(riderRepo.saveMany).not.toHaveBeenCalled();
      expect(startlistRepo.saveMany).not.toHaveBeenCalled();
    });
  });
});
