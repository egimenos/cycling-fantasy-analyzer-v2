import { ScrapeJob } from './scrape-job.entity';
import { ScrapeStatus } from '../shared/scrape-status.enum';

describe('ScrapeJob', () => {
  describe('create', () => {
    it('should create a job in PENDING state', () => {
      const job = ScrapeJob.create('tour-de-france', 2024);

      expect(job.id).toBeDefined();
      expect(job.id).toHaveLength(36);
      expect(job.raceSlug).toBe('tour-de-france');
      expect(job.year).toBe(2024);
      expect(job.status).toBe(ScrapeStatus.PENDING);
      expect(job.startedAt).toBeNull();
      expect(job.completedAt).toBeNull();
      expect(job.errorMessage).toBeNull();
      expect(job.recordsUpserted).toBe(0);
    });
  });

  describe('reconstitute', () => {
    it('should hydrate from props', () => {
      const startedAt = new Date('2024-07-01T10:00:00Z');
      const job = ScrapeJob.reconstitute({
        id: 'test-id',
        raceSlug: 'giro-d-italia',
        year: 2024,
        status: ScrapeStatus.RUNNING,
        startedAt,
        completedAt: null,
        errorMessage: null,
        recordsUpserted: 0,
      });

      expect(job.id).toBe('test-id');
      expect(job.status).toBe(ScrapeStatus.RUNNING);
      expect(job.startedAt).toEqual(startedAt);
    });
  });

  describe('markRunning', () => {
    it('should transition PENDING to RUNNING', () => {
      const job = ScrapeJob.create('tour-de-france', 2024);
      const running = job.markRunning();

      expect(running.status).toBe(ScrapeStatus.RUNNING);
      expect(running.startedAt).toBeInstanceOf(Date);
      expect(job.status).toBe(ScrapeStatus.PENDING);
    });

    it('should throw if not in PENDING state', () => {
      const job = ScrapeJob.create('tour-de-france', 2024).markRunning();

      expect(() => job.markRunning()).toThrow("Cannot start job in 'running' state");
    });
  });

  describe('markSuccess', () => {
    it('should transition RUNNING to SUCCESS', () => {
      const job = ScrapeJob.create('tour-de-france', 2024).markRunning();
      const success = job.markSuccess(150);

      expect(success.status).toBe(ScrapeStatus.SUCCESS);
      expect(success.completedAt).toBeInstanceOf(Date);
      expect(success.recordsUpserted).toBe(150);
    });

    it('should throw if not in RUNNING state', () => {
      const job = ScrapeJob.create('tour-de-france', 2024);

      expect(() => job.markSuccess(10)).toThrow("Cannot complete job in 'pending' state");
    });

    it('should throw if already succeeded', () => {
      const job = ScrapeJob.create('tour-de-france', 2024).markRunning().markSuccess(10);

      expect(() => job.markSuccess(20)).toThrow("Cannot complete job in 'success' state");
    });
  });

  describe('markFailed', () => {
    it('should transition RUNNING to FAILED', () => {
      const job = ScrapeJob.create('tour-de-france', 2024).markRunning();
      const failed = job.markFailed('Parser error');

      expect(failed.status).toBe(ScrapeStatus.FAILED);
      expect(failed.completedAt).toBeInstanceOf(Date);
      expect(failed.errorMessage).toBe('Parser error');
    });

    it('should throw if not in RUNNING state', () => {
      const job = ScrapeJob.create('tour-de-france', 2024);

      expect(() => job.markFailed('error')).toThrow("Cannot fail job in 'pending' state");
    });

    it('should throw if already failed', () => {
      const job = ScrapeJob.create('tour-de-france', 2024).markRunning().markFailed('first error');

      expect(() => job.markFailed('second error')).toThrow("Cannot fail job in 'failed' state");
    });
  });

  describe('toProps', () => {
    it('should return a copy of all properties', () => {
      const job = ScrapeJob.create('vuelta-a-espana', 2024);
      const props = job.toProps();

      expect(props.id).toBe(job.id);
      expect(props.raceSlug).toBe('vuelta-a-espana');
      expect(props.year).toBe(2024);
      expect(props.status).toBe(ScrapeStatus.PENDING);
    });
  });
});
