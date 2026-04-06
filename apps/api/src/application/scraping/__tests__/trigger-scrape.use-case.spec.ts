import { TriggerScrapeUseCase, RaceMetadata } from '../trigger-scrape.use-case';
import { ScrapeJob } from '../../../domain/scrape-job/scrape-job.entity';
import { ScrapeStatus } from '../../../domain/shared/scrape-status.enum';
import { ResultCategory } from '../../../domain/shared/result-category.enum';
import { RaceType } from '../../../domain/shared/race-type.enum';
import { RaceClass } from '../../../domain/shared/race-class.enum';
import type { ParsedResult, ClassificationUrl } from '../ports/scraping.types';

const mockPcsClient = { fetchPage: jest.fn() };
const mockRiderRepo = {
  findByPcsSlug: jest.fn(),
  findByPcsSlugs: jest.fn(),
  findByIds: jest.fn(),
  findAll: jest.fn(),
  findMissingAvatars: jest.fn(),
  save: jest.fn(),
  saveMany: jest.fn(),
};
const mockResultRepo = {
  findByRider: jest.fn(),
  findByRiderIds: jest.fn(),
  findByRiderIdsBeforeDate: jest.fn(),
  findByRace: jest.fn(),
  saveMany: jest.fn(),
};
const mockJobRepo = {
  save: jest.fn(),
  findById: jest.fn(),
  findByRaceAndYear: jest.fn(),
  findRecent: jest.fn(),
  findStale: jest.fn(),
};
const mockParser = {
  extractClassificationUrls: jest.fn(),
  parseGcResults: jest.fn(),
  parseStageResults: jest.fn(),
  parseMountainClassification: jest.fn(),
  parseSprintClassification: jest.fn(),
  parseClassicResults: jest.fn(),
  parseRaceDate: jest.fn(),
  parseStageClassifications: jest.fn(),
  validateClassificationResults: jest.fn(),
  validateStageRaceCompleteness: jest.fn(),
};

function createUseCase(): TriggerScrapeUseCase {
  return new TriggerScrapeUseCase(
    mockPcsClient as never,
    mockParser as never,
    mockRiderRepo as never,
    mockResultRepo as never,
    mockJobRepo as never,
  );
}

const CLASSIC_METADATA: RaceMetadata = {
  name: 'Milano-Sanremo',
  raceType: RaceType.CLASSIC,
  raceClass: RaceClass.UWT,
};

const GRAND_TOUR_METADATA: RaceMetadata = {
  name: 'Tour de France',
  raceType: RaceType.GRAND_TOUR,
  raceClass: RaceClass.UWT,
  expectedStages: 21,
};

function makeParsedResults(
  count: number,
  category: ResultCategory = ResultCategory.GC,
  opts?: { stageNumber?: number },
): ParsedResult[] {
  return Array.from({ length: count }, (_, i) => ({
    riderName: `Rider ${i + 1}`,
    riderSlug: `rider-${i + 1}`,
    teamName: `Team ${i + 1}`,
    position: i + 1,
    category,
    stageNumber: opts?.stageNumber ?? null,
    dnf: false,
    parcoursType: null,
    isItt: false,
    isTtt: false,
    profileScore: null,
    raceDate: null,
  }));
}

function makeStageClassificationUrls(stageCount: number): ClassificationUrl[] {
  const urls: ClassificationUrl[] = [
    {
      urlPath: 'race/tour-de-france/2024/gc',
      classificationType: 'GC',
      stageNumber: null,
      label: 'GC',
    },
  ];
  for (let i = 1; i <= stageCount; i++) {
    urls.push({
      urlPath: `race/tour-de-france/2024/stage-${i}`,
      classificationType: 'STAGE',
      stageNumber: i,
      label: `Stage ${i}`,
    });
  }
  urls.push(
    {
      urlPath: 'race/tour-de-france/2024/points',
      classificationType: 'SPRINT',
      stageNumber: null,
      label: 'Points classification',
    },
    {
      urlPath: 'race/tour-de-france/2024/kom',
      classificationType: 'MOUNTAIN',
      stageNumber: null,
      label: 'Mountains classification',
    },
  );
  return urls;
}

// Minimal valid HTML that parsers can extract results from
function makeResultHtml(riderCount: number): string {
  const rows = Array.from(
    { length: riderCount },
    (_, i) =>
      `<tr><td>${i + 1}</td><td><a href="rider/rider-${i + 1}">Rider ${i + 1}</a></td><td>Team ${i + 1}</td></tr>`,
  ).join('');
  return `<html><body><div class="resTab"><table class="results">
    <thead><tr><th>Rnk</th><th>Rider</th><th>Team</th></tr></thead>
    <tbody>${rows}</tbody></table></div></body></html>`;
}

describe('TriggerScrapeUseCase', () => {
  let useCase: TriggerScrapeUseCase;

  beforeEach(() => {
    jest.clearAllMocks();
    useCase = createUseCase();
    mockResultRepo.saveMany.mockResolvedValue(0);
    mockRiderRepo.findByPcsSlugs.mockResolvedValue([]);
    mockRiderRepo.saveMany.mockResolvedValue(undefined);

    // Default parser mock returns
    mockParser.parseClassicResults.mockReturnValue(makeParsedResults(100));
    mockParser.parseRaceDate.mockReturnValue(new Date('2024-07-01'));
    mockParser.validateClassificationResults.mockReturnValue({
      valid: true,
      warnings: [],
      errors: [],
    });
    mockParser.validateStageRaceCompleteness.mockReturnValue({
      valid: true,
      warnings: [],
      errors: [],
    });
    mockParser.extractClassificationUrls.mockReturnValue([]);
    mockParser.parseGcResults.mockReturnValue(makeParsedResults(150));
    mockParser.parseStageResults.mockReturnValue(makeParsedResults(150, ResultCategory.STAGE));
    mockParser.parseSprintClassification.mockReturnValue(
      makeParsedResults(150, ResultCategory.SPRINT),
    );
    mockParser.parseMountainClassification.mockReturnValue(
      makeParsedResults(150, ResultCategory.MOUNTAIN),
    );
    mockParser.parseStageClassifications.mockReturnValue({
      dailyGC: [],
      mountainPasses: [],
      intermediateSprints: [],
      dailyRegularidad: [],
    });
  });

  it('should scrape a classic race end-to-end', async () => {
    const classicHtml = makeResultHtml(100);
    mockPcsClient.fetchPage.mockResolvedValue(classicHtml);
    mockResultRepo.saveMany.mockResolvedValue(100);

    const result = await useCase.execute({
      raceSlug: 'milano-sanremo',
      year: 2024,
      raceMetadata: CLASSIC_METADATA,
    });

    expect(result.jobId).toBeDefined();
    expect(result.status).toBe(ScrapeStatus.SUCCESS);
    expect(result.recordsUpserted).toBe(100);
    expect(result.warnings).toEqual([]);
    expect(mockPcsClient.fetchPage).toHaveBeenCalledWith('race/milano-sanremo/2024/result');
    expect(mockJobRepo.save).toHaveBeenCalledTimes(3); // create + running + success
  });

  it('should create job, mark running, then mark success', async () => {
    const classicHtml = makeResultHtml(100);
    mockPcsClient.fetchPage.mockResolvedValue(classicHtml);
    mockResultRepo.saveMany.mockResolvedValue(100);

    await useCase.execute({
      raceSlug: 'milano-sanremo',
      year: 2024,
      raceMetadata: CLASSIC_METADATA,
    });

    const savedJobs = mockJobRepo.save.mock.calls.map((c: [ScrapeJob]) => c[0]);
    expect(savedJobs[0].status).toBe(ScrapeStatus.PENDING);
    expect(savedJobs[1].status).toBe(ScrapeStatus.RUNNING);
    expect(savedJobs[2].status).toBe(ScrapeStatus.SUCCESS);
  });

  it('should mark job as failed on error', async () => {
    mockPcsClient.fetchPage.mockRejectedValue(new Error('Network error'));

    await expect(
      useCase.execute({ raceSlug: 'milano-sanremo', year: 2024, raceMetadata: CLASSIC_METADATA }),
    ).rejects.toThrow('Network error');

    const savedJobs = mockJobRepo.save.mock.calls.map((c: [ScrapeJob]) => c[0]);
    expect(savedJobs[2].status).toBe(ScrapeStatus.FAILED);
    expect(savedJobs[2].errorMessage).toBe('Network error');
  });

  it('should batch-upsert riders from parsed results', async () => {
    mockParser.parseClassicResults.mockReturnValue(makeParsedResults(3));
    mockPcsClient.fetchPage.mockResolvedValue('<html></html>');
    mockResultRepo.saveMany.mockResolvedValue(3);

    await useCase.execute({
      raceSlug: 'milano-sanremo',
      year: 2024,
      raceMetadata: CLASSIC_METADATA,
    });

    expect(mockRiderRepo.findByPcsSlugs).toHaveBeenCalledTimes(1);
    expect(mockRiderRepo.findByPcsSlugs).toHaveBeenCalledWith(
      expect.arrayContaining(['rider-1', 'rider-2', 'rider-3']),
    );
    expect(mockRiderRepo.saveMany).toHaveBeenCalledTimes(1);
    expect(mockRiderRepo.saveMany.mock.calls[0][0]).toHaveLength(3);
  });

  it('should scrape a stage race with classification URL extraction', async () => {
    mockParser.extractClassificationUrls.mockReturnValue(makeStageClassificationUrls(21));
    mockPcsClient.fetchPage.mockResolvedValue('<html></html>');
    mockResultRepo.saveMany.mockResolvedValue(3600);

    const result = await useCase.execute({
      raceSlug: 'tour-de-france',
      year: 2024,
      raceMetadata: GRAND_TOUR_METADATA,
    });

    expect(result.status).toBe(ScrapeStatus.SUCCESS);
    // 1 GC page + 24 classification pages (21 stages + points + mountains + GC)
    expect(mockPcsClient.fetchPage).toHaveBeenCalledTimes(25);
    expect(mockPcsClient.fetchPage).toHaveBeenCalledWith('race/tour-de-france/2024/gc');
  });

  it('should pass parsed results through validation', async () => {
    mockParser.parseClassicResults.mockReturnValue([]);
    mockParser.validateClassificationResults.mockReturnValue({
      valid: false,
      warnings: [],
      errors: ['Empty results'],
    });
    mockPcsClient.fetchPage.mockResolvedValue('<html></html>');

    await expect(
      useCase.execute({ raceSlug: 'milano-sanremo', year: 2024, raceMetadata: CLASSIC_METADATA }),
    ).rejects.toThrow('Validation failed');

    // Job should be marked as failed
    const lastSave = mockJobRepo.save.mock.calls.at(-1);
    expect(lastSave[0].status).toBe(ScrapeStatus.FAILED);
  });

  it('should skip empty non-GC classifications with warnings', async () => {
    mockParser.extractClassificationUrls.mockReturnValue(makeStageClassificationUrls(21));
    // Stage 3 returns empty results → triggers validation warning
    mockParser.parseStageResults.mockImplementation((_html: string, stageNumber: number) => {
      if (stageNumber === 3) return [];
      return makeParsedResults(150, ResultCategory.STAGE, { stageNumber });
    });
    mockParser.validateClassificationResults.mockImplementation((results: ParsedResult[]) => {
      if (results.length === 0) {
        return {
          valid: false,
          warnings: ['Empty'],
          errors: ['stage 3: 0 results — suspended/cancelled stage?'],
        };
      }
      return { valid: true, warnings: [], errors: [] };
    });
    mockPcsClient.fetchPage.mockResolvedValue('<html></html>');
    mockResultRepo.saveMany.mockResolvedValue(3000);

    const result = await useCase.execute({
      raceSlug: 'tour-de-france',
      year: 2024,
      raceMetadata: GRAND_TOUR_METADATA,
    });

    expect(result.status).toBe(ScrapeStatus.SUCCESS);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings.some((w) => w.includes('stage 3'))).toBe(true);
    expect(result.warnings.some((w) => w.includes('suspended/cancelled'))).toBe(true);
  });

  it('should map parsed results to RaceResult entities with correct category', async () => {
    mockPcsClient.fetchPage.mockResolvedValue('<html></html>');
    mockResultRepo.saveMany.mockResolvedValue(100);

    await useCase.execute({
      raceSlug: 'milano-sanremo',
      year: 2024,
      raceMetadata: CLASSIC_METADATA,
    });

    const savedResults = mockResultRepo.saveMany.mock.calls[0][0];
    expect(savedResults.length).toBe(100);
    for (const r of savedResults) {
      expect(r.toProps().category).toBe(ResultCategory.GC);
      expect(r.toProps().raceSlug).toBe('milano-sanremo');
      expect(r.toProps().year).toBe(2024);
    }
  });

  describe('stage classification integration', () => {
    beforeEach(() => {
      mockParser.extractClassificationUrls.mockReturnValue(makeStageClassificationUrls(21));
      mockPcsClient.fetchPage.mockResolvedValue('<html></html>');
    });

    it('should extract daily classifications from stage pages and include in results', async () => {
      mockParser.parseStageClassifications.mockReturnValue({
        dailyGC: makeParsedResults(10, ResultCategory.GC_DAILY),
        mountainPasses: [
          ...makeParsedResults(5, ResultCategory.MOUNTAIN_PASS).map((r) => ({
            ...r,
            climbCategory: '1',
            climbName: 'Col du Test',
            kmMarker: 45.2,
          })),
        ],
        intermediateSprints: [
          ...makeParsedResults(3, ResultCategory.SPRINT_INTERMEDIATE).map((r) => ({
            ...r,
            sprintName: 'Test Sprint',
            kmMarker: 80.5,
          })),
        ],
        dailyRegularidad: makeParsedResults(10, ResultCategory.REGULARIDAD_DAILY),
      });
      mockResultRepo.saveMany.mockResolvedValue(5000);

      const result = await useCase.execute({
        raceSlug: 'tour-de-france',
        year: 2024,
        raceMetadata: GRAND_TOUR_METADATA,
      });

      expect(result.status).toBe(ScrapeStatus.SUCCESS);

      const savedResults = mockResultRepo.saveMany.mock.calls[0][0];
      const categories = savedResults.map(
        (r: { toProps: () => { category: string } }) => r.toProps().category,
      );

      expect(categories).toContain(ResultCategory.GC_DAILY);
      expect(categories).toContain(ResultCategory.MOUNTAIN_PASS);
      expect(categories).toContain(ResultCategory.SPRINT_INTERMEDIATE);
      expect(categories).toContain(ResultCategory.REGULARIDAD_DAILY);
    });

    it('should include climbCategory and climbName for mountain pass results', async () => {
      mockParser.parseStageClassifications.mockReturnValue({
        dailyGC: [],
        mountainPasses: [
          ...makeParsedResults(5, ResultCategory.MOUNTAIN_PASS).map((r) => ({
            ...r,
            climbCategory: '1',
            climbName: 'Col du Test',
            kmMarker: 45.2,
          })),
        ],
        intermediateSprints: [],
        dailyRegularidad: [],
      });
      mockResultRepo.saveMany.mockResolvedValue(5000);

      await useCase.execute({
        raceSlug: 'tour-de-france',
        year: 2024,
        raceMetadata: GRAND_TOUR_METADATA,
      });

      const savedResults = mockResultRepo.saveMany.mock.calls[0][0];
      const mountainResults = savedResults.filter(
        (r: { toProps: () => { category: string } }) =>
          r.toProps().category === ResultCategory.MOUNTAIN_PASS,
      );

      expect(mountainResults.length).toBeGreaterThan(0);
      for (const r of mountainResults) {
        const props = r.toProps();
        expect(props.climbCategory).toBe('1');
        expect(props.climbName).toBe('Col du Test');
        expect(props.kmMarker).toBe(45.2);
      }
    });

    it('should include sprintName for sprint intermediate results', async () => {
      mockParser.parseStageClassifications.mockReturnValue({
        dailyGC: [],
        mountainPasses: [],
        intermediateSprints: [
          ...makeParsedResults(3, ResultCategory.SPRINT_INTERMEDIATE).map((r) => ({
            ...r,
            sprintName: 'Test Sprint',
            kmMarker: 80.5,
          })),
        ],
        dailyRegularidad: [],
      });
      mockResultRepo.saveMany.mockResolvedValue(5000);

      await useCase.execute({
        raceSlug: 'tour-de-france',
        year: 2024,
        raceMetadata: GRAND_TOUR_METADATA,
      });

      const savedResults = mockResultRepo.saveMany.mock.calls[0][0];
      const sprintResults = savedResults.filter(
        (r: { toProps: () => { category: string } }) =>
          r.toProps().category === ResultCategory.SPRINT_INTERMEDIATE,
      );

      expect(sprintResults.length).toBeGreaterThan(0);
      for (const r of sprintResults) {
        const props = r.toProps();
        expect(props.sprintName).toBe('Test Sprint');
        expect(props.kmMarker).toBe(80.5);
      }
    });

    it('should continue gracefully when parseStageClassifications returns empty arrays', async () => {
      // Default mock already returns empty arrays for stage classifications
      mockResultRepo.saveMany.mockResolvedValue(3600);

      const result = await useCase.execute({
        raceSlug: 'tour-de-france',
        year: 2024,
        raceMetadata: GRAND_TOUR_METADATA,
      });

      expect(result.status).toBe(ScrapeStatus.SUCCESS);
    });
  });
});
