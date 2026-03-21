import { TriggerScrapeUseCase, RaceMetadata } from '../trigger-scrape.use-case';
import { ScrapeJob } from '../../../domain/scrape-job/scrape-job.entity';
import { ScrapeStatus } from '../../../domain/shared/scrape-status.enum';
import { ResultCategory } from '../../../domain/shared/result-category.enum';
import { RaceType } from '../../../domain/shared/race-type.enum';
import { RaceClass } from '../../../domain/shared/race-class.enum';

const mockPcsClient = { fetchPage: jest.fn() };
const mockRiderRepo = {
  findByPcsSlug: jest.fn(),
  findByPcsSlugs: jest.fn(),
  findByIds: jest.fn(),
  findAll: jest.fn(),
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

function createUseCase(): TriggerScrapeUseCase {
  return new TriggerScrapeUseCase(
    mockPcsClient as never,
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

/**
 * Build stage HTML that includes hidden classification tabs (daily GC, mountain, sprint).
 * The first resTab is visible (stage results), hidden tabs contain daily classifications.
 */
function makeStageHtmlWithClassificationTabs(riderCount: number): string {
  const stageRows = Array.from(
    { length: riderCount },
    (_, i) =>
      `<tr><td>${i + 1}</td><td><a href="rider/rider-${i + 1}">Rider ${i + 1}</a></td><td><a href="team/team-${i + 1}">Team ${i + 1}</a></td></tr>`,
  ).join('');

  // Hidden GC tab with "Time won/lost" header
  const gcRows = Array.from(
    { length: 10 },
    (_, i) =>
      `<tr><td>${i + 1}</td><td><a href="rider/rider-${i + 1}">Rider ${i + 1}</a></td><td><a href="team/team-${i + 1}">Team ${i + 1}</a></td><td>+0:${String(i).padStart(2, '0')}</td></tr>`,
  ).join('');

  // Hidden mountain tab with a KOM Sprint heading
  const mountainRows = Array.from(
    { length: 5 },
    (_, i) =>
      `<tr><td>${i + 1}</td><td><a href="rider/rider-${i + 1}">Rider ${i + 1}</a></td><td><a href="team/team-${i + 1}">Team ${i + 1}</a></td></tr>`,
  ).join('');

  // Hidden points tab with sprint and regularidad data
  const sprintRows = Array.from(
    { length: 3 },
    (_, i) =>
      `<tr><td>${i + 1}</td><td><a href="rider/rider-${i + 1}">Rider ${i + 1}</a></td><td><a href="team/team-${i + 1}">Team ${i + 1}</a></td></tr>`,
  ).join('');

  const regulRows = Array.from(
    { length: 10 },
    (_, i) =>
      `<tr><td>${i + 1}</td><td><a href="rider/rider-${i + 1}">Rider ${i + 1}</a></td><td><a href="team/team-${i + 1}">Team ${i + 1}</a></td><td>${50 - i * 5}</td><td>${10 - i}</td></tr>`,
  ).join('');

  return `<html><body>
    <div class="resTab"><table class="results">
      <thead><tr><th>Rnk</th><th>Rider</th><th>Team</th></tr></thead>
      <tbody>${stageRows}</tbody></table></div>
    <div class="resTab hide">
      <table class="results">
        <thead><tr><th>Rnk</th><th>Rider</th><th>Team</th><th>Time won/lost</th></tr></thead>
        <tbody>${gcRows}</tbody></table></div>
    <div class="resTab hide">
      <h3>KOM Sprint (1) Col du Test (45.2 km)</h3>
      <table class="results">
        <thead><tr><th>Rnk</th><th>Rider</th><th>Team</th></tr></thead>
        <tbody>${mountainRows}</tbody></table></div>
    <div class="resTab hide">
      <h3>Sprint | Test Sprint (80.5 km)</h3>
      <table class="results">
        <thead><tr><th>Rnk</th><th>Rider</th><th>Team</th></tr></thead>
        <tbody>${sprintRows}</tbody></table>
      <table class="results">
        <thead><tr><th>Rnk</th><th>Rider</th><th>Team</th><th>Pnt</th><th>Today</th></tr></thead>
        <tbody>${regulRows}</tbody></table></div>
    </body></html>`;
}

function makeGcPageWithSelectNav(): string {
  const gcHtml = makeResultHtml(150);
  const selectNav = `
    <div class="selectNav">
      <a href="#">PREV</a>
      <select>
        <option value="race/tour-de-france/2024/gc/result/result">GC</option>
        <option value="race/tour-de-france/2024/stage-1/result/result">Stage 1</option>
        <option value="race/tour-de-france/2024/stage-2/result/result">Stage 2</option>
        <option value="race/tour-de-france/2024/stage-3/result/result">Stage 3</option>
        <option value="race/tour-de-france/2024/stage-4/result/result">Stage 4</option>
        <option value="race/tour-de-france/2024/stage-5/result/result">Stage 5</option>
        <option value="race/tour-de-france/2024/stage-6/result/result">Stage 6</option>
        <option value="race/tour-de-france/2024/stage-7/result/result">Stage 7</option>
        <option value="race/tour-de-france/2024/stage-8/result/result">Stage 8</option>
        <option value="race/tour-de-france/2024/stage-9/result/result">Stage 9</option>
        <option value="race/tour-de-france/2024/stage-10/result/result">Stage 10</option>
        <option value="race/tour-de-france/2024/stage-11/result/result">Stage 11</option>
        <option value="race/tour-de-france/2024/stage-12/result/result">Stage 12</option>
        <option value="race/tour-de-france/2024/stage-13/result/result">Stage 13</option>
        <option value="race/tour-de-france/2024/stage-14/result/result">Stage 14</option>
        <option value="race/tour-de-france/2024/stage-15/result/result">Stage 15</option>
        <option value="race/tour-de-france/2024/stage-16/result/result">Stage 16</option>
        <option value="race/tour-de-france/2024/stage-17/result/result">Stage 17</option>
        <option value="race/tour-de-france/2024/stage-18/result/result">Stage 18</option>
        <option value="race/tour-de-france/2024/stage-19/result/result">Stage 19</option>
        <option value="race/tour-de-france/2024/stage-20/result/result">Stage 20</option>
        <option value="race/tour-de-france/2024/stage-21/result/result">Stage 21</option>
        <option value="race/tour-de-france/2024/points/result/result">Points classification</option>
        <option value="race/tour-de-france/2024/kom/result/result">Mountains classification</option>
      </select>
      <a href="#">NEXT</a>
    </div>`;
  return gcHtml.replace('</body>', selectNav + '</body>');
}

describe('TriggerScrapeUseCase', () => {
  let useCase: TriggerScrapeUseCase;

  beforeEach(() => {
    jest.clearAllMocks();
    useCase = createUseCase();
    mockResultRepo.saveMany.mockResolvedValue(0);
    mockRiderRepo.findByPcsSlugs.mockResolvedValue([]);
    mockRiderRepo.saveMany.mockResolvedValue(undefined);
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
    const classicHtml = makeResultHtml(3);
    mockPcsClient.fetchPage.mockResolvedValue(classicHtml);
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
    const gcHtml = makeGcPageWithSelectNav();
    const stageHtml = makeResultHtml(150);

    mockPcsClient.fetchPage.mockResolvedValue(stageHtml);
    // Override first call (GC page) with the selectNav version
    mockPcsClient.fetchPage.mockResolvedValueOnce(gcHtml);

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
    // HTML with no results table → empty results → validation fails
    mockPcsClient.fetchPage.mockResolvedValue('<html><body></body></html>');

    await expect(
      useCase.execute({ raceSlug: 'milano-sanremo', year: 2024, raceMetadata: CLASSIC_METADATA }),
    ).rejects.toThrow('Validation failed');

    // Job should be marked as failed
    const lastSave = mockJobRepo.save.mock.calls.at(-1);
    expect(lastSave[0].status).toBe(ScrapeStatus.FAILED);
  });

  it('should skip empty non-GC classifications with warnings', async () => {
    const gcHtml = makeGcPageWithSelectNav();
    const stageHtml = makeResultHtml(150);
    const emptyHtml = '<html><body></body></html>';

    // GC page first, then alternate: return empty for stage-3
    mockPcsClient.fetchPage.mockImplementation((path: string) => {
      if (path.includes('/gc')) return Promise.resolve(gcHtml);
      if (path.includes('stage-3')) return Promise.resolve(emptyHtml);
      return Promise.resolve(stageHtml);
    });

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
    const classicHtml = makeResultHtml(100);
    mockPcsClient.fetchPage.mockResolvedValue(classicHtml);
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
    it('should extract daily classifications from stage pages and include in results', async () => {
      const gcHtml = makeGcPageWithSelectNav();
      const stageHtml = makeStageHtmlWithClassificationTabs(150);
      const plainHtml = makeResultHtml(150);

      mockPcsClient.fetchPage.mockImplementation((path: string) => {
        if (path.includes('/gc')) return Promise.resolve(gcHtml);
        if (path.includes('stage-')) return Promise.resolve(stageHtml);
        return Promise.resolve(plainHtml);
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

      // Should include the new daily classification categories
      expect(categories).toContain(ResultCategory.GC_DAILY);
      expect(categories).toContain(ResultCategory.MOUNTAIN_PASS);
      expect(categories).toContain(ResultCategory.SPRINT_INTERMEDIATE);
      expect(categories).toContain(ResultCategory.REGULARIDAD_DAILY);
    });

    it('should include climbCategory and climbName for mountain pass results', async () => {
      const gcHtml = makeGcPageWithSelectNav();
      const stageHtml = makeStageHtmlWithClassificationTabs(150);
      const plainHtml = makeResultHtml(150);

      mockPcsClient.fetchPage.mockImplementation((path: string) => {
        if (path.includes('/gc')) return Promise.resolve(gcHtml);
        if (path.includes('stage-')) return Promise.resolve(stageHtml);
        return Promise.resolve(plainHtml);
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
      const gcHtml = makeGcPageWithSelectNav();
      const stageHtml = makeStageHtmlWithClassificationTabs(150);
      const plainHtml = makeResultHtml(150);

      mockPcsClient.fetchPage.mockImplementation((path: string) => {
        if (path.includes('/gc')) return Promise.resolve(gcHtml);
        if (path.includes('stage-')) return Promise.resolve(stageHtml);
        return Promise.resolve(plainHtml);
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
      const gcHtml = makeGcPageWithSelectNav();
      // Stage HTML with no hidden tabs — only visible results tab
      const stageHtml = makeResultHtml(150);
      const plainHtml = makeResultHtml(150);

      mockPcsClient.fetchPage.mockImplementation((path: string) => {
        if (path.includes('/gc')) return Promise.resolve(gcHtml);
        return Promise.resolve(path.includes('stage-') ? stageHtml : plainHtml);
      });

      mockResultRepo.saveMany.mockResolvedValue(3600);

      const result = await useCase.execute({
        raceSlug: 'tour-de-france',
        year: 2024,
        raceMetadata: GRAND_TOUR_METADATA,
      });

      // Should still succeed without classification data
      expect(result.status).toBe(ScrapeStatus.SUCCESS);
    });
  });
});
