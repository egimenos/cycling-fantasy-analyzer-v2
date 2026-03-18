import { GetScrapeJobsUseCase } from './get-scrape-jobs.use-case';
import { ScrapeJob } from '../../domain/scrape-job/scrape-job.entity';

const mockRepo = {
  save: jest.fn(),
  findById: jest.fn(),
  findByRaceAndYear: jest.fn(),
  findRecent: jest.fn(),
  findStale: jest.fn(),
};

describe('GetScrapeJobsUseCase', () => {
  let useCase: GetScrapeJobsUseCase;

  beforeEach(() => {
    jest.clearAllMocks();
    useCase = new GetScrapeJobsUseCase(mockRepo as never);
  });

  it('should delegate to repository findRecent', async () => {
    const jobs = [ScrapeJob.create('tour-de-france', 2024)];
    mockRepo.findRecent.mockResolvedValue(jobs);

    const result = await useCase.execute(10);

    expect(mockRepo.findRecent).toHaveBeenCalledWith(10, undefined);
    expect(result).toEqual(jobs);
  });

  it('should pass status filter to repository', async () => {
    mockRepo.findRecent.mockResolvedValue([]);

    await useCase.execute(5, 'success');

    expect(mockRepo.findRecent).toHaveBeenCalledWith(5, 'success');
  });
});
