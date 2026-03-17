import { NotFoundException } from '@nestjs/common';
import { TriggerScrapeUseCase } from './trigger-scrape.use-case';
import { ScrapeJob } from '../../domain/scrape-job/scrape-job.entity';
import { ScrapeStatus } from '../../domain/shared/scrape-status.enum';
import { ResultCategory } from '../../domain/shared/result-category.enum';

const mockPcsClient = { fetchPage: jest.fn() };
const mockRiderRepo = {
  findByPcsSlug: jest.fn(),
  findAll: jest.fn(),
  save: jest.fn(),
};
const mockResultRepo = {
  findByRider: jest.fn(),
  findByRiderIds: jest.fn(),
  findByRace: jest.fn(),
  saveMany: jest.fn(),
};
const mockJobRepo = {
  save: jest.fn(),
  findById: jest.fn(),
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
    mockRiderRepo.findByPcsSlug.mockResolvedValue(null);
  });

  it('should throw NotFoundException for unknown race slug', async () => {
    await expect(useCase.execute({ raceSlug: 'nonexistent-race', year: 2024 })).rejects.toThrow(
      NotFoundException,
    );
  });

  it('should scrape a classic race end-to-end', async () => {
    const classicHtml = makeResultHtml(100);
    mockPcsClient.fetchPage.mockResolvedValue(classicHtml);
    mockResultRepo.saveMany.mockResolvedValue(100);

    const result = await useCase.execute({
      raceSlug: 'milano-sanremo',
      year: 2024,
    });

    expect(result.jobId).toBeDefined();
    expect(result.status).toBe(ScrapeStatus.SUCCESS);
    expect(result.recordsUpserted).toBe(100);
    expect(mockPcsClient.fetchPage).toHaveBeenCalledWith('race/milano-sanremo/2024/result');
    expect(mockJobRepo.save).toHaveBeenCalledTimes(3); // create + running + success
  });

  it('should create job, mark running, then mark success', async () => {
    const classicHtml = makeResultHtml(100);
    mockPcsClient.fetchPage.mockResolvedValue(classicHtml);
    mockResultRepo.saveMany.mockResolvedValue(100);

    await useCase.execute({ raceSlug: 'milano-sanremo', year: 2024 });

    const savedJobs = mockJobRepo.save.mock.calls.map((c: [ScrapeJob]) => c[0]);
    expect(savedJobs[0].status).toBe(ScrapeStatus.PENDING);
    expect(savedJobs[1].status).toBe(ScrapeStatus.RUNNING);
    expect(savedJobs[2].status).toBe(ScrapeStatus.SUCCESS);
  });

  it('should mark job as failed on error', async () => {
    mockPcsClient.fetchPage.mockRejectedValue(new Error('Network error'));

    await expect(useCase.execute({ raceSlug: 'milano-sanremo', year: 2024 })).rejects.toThrow(
      'Network error',
    );

    const savedJobs = mockJobRepo.save.mock.calls.map((c: [ScrapeJob]) => c[0]);
    expect(savedJobs[2].status).toBe(ScrapeStatus.FAILED);
    expect(savedJobs[2].errorMessage).toBe('Network error');
  });

  it('should upsert riders from parsed results', async () => {
    const classicHtml = makeResultHtml(3);
    mockPcsClient.fetchPage.mockResolvedValue(classicHtml);
    mockResultRepo.saveMany.mockResolvedValue(3);

    await useCase.execute({ raceSlug: 'milano-sanremo', year: 2024 });

    expect(mockRiderRepo.save).toHaveBeenCalledTimes(3);
    expect(mockRiderRepo.findByPcsSlug).toHaveBeenCalledTimes(3);
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
    });

    expect(result.status).toBe(ScrapeStatus.SUCCESS);
    // 1 GC page + 24 classification pages (21 stages + points + mountains + GC)
    expect(mockPcsClient.fetchPage).toHaveBeenCalledTimes(25);
    expect(mockPcsClient.fetchPage).toHaveBeenCalledWith('race/tour-de-france/2024/gc');
  });

  it('should pass parsed results through validation', async () => {
    // HTML with no results table → empty results → validation fails
    mockPcsClient.fetchPage.mockResolvedValue('<html><body></body></html>');

    await expect(useCase.execute({ raceSlug: 'milano-sanremo', year: 2024 })).rejects.toThrow(
      'Validation failed',
    );

    // Job should be marked as failed
    const lastSave = mockJobRepo.save.mock.calls.at(-1);
    expect(lastSave[0].status).toBe(ScrapeStatus.FAILED);
  });

  it('should map parsed results to RaceResult entities with correct category', async () => {
    const classicHtml = makeResultHtml(100);
    mockPcsClient.fetchPage.mockResolvedValue(classicHtml);
    mockResultRepo.saveMany.mockResolvedValue(100);

    await useCase.execute({ raceSlug: 'milano-sanremo', year: 2024 });

    const savedResults = mockResultRepo.saveMany.mock.calls[0][0];
    expect(savedResults.length).toBe(100);
    for (const r of savedResults) {
      expect(r.toProps().category).toBe(ResultCategory.GC);
      expect(r.toProps().raceSlug).toBe('milano-sanremo');
      expect(r.toProps().year).toBe(2024);
    }
  });
});
