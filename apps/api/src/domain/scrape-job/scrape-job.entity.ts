import { randomUUID } from 'node:crypto';
import { ScrapeStatus } from '../shared/scrape-status.enum';

export interface ScrapeJobProps {
  readonly id: string;
  readonly raceSlug: string;
  readonly year: number;
  readonly status: ScrapeStatus;
  readonly startedAt: Date | null;
  readonly completedAt: Date | null;
  readonly errorMessage: string | null;
  readonly recordsUpserted: number;
}

export class ScrapeJob {
  private constructor(private readonly props: ScrapeJobProps) {}

  static create(raceSlug: string, year: number): ScrapeJob {
    return new ScrapeJob({
      id: randomUUID(),
      raceSlug,
      year,
      status: ScrapeStatus.PENDING,
      startedAt: null,
      completedAt: null,
      errorMessage: null,
      recordsUpserted: 0,
    });
  }

  static reconstitute(props: ScrapeJobProps): ScrapeJob {
    return new ScrapeJob(props);
  }

  get id(): string {
    return this.props.id;
  }

  get raceSlug(): string {
    return this.props.raceSlug;
  }

  get year(): number {
    return this.props.year;
  }

  get status(): ScrapeStatus {
    return this.props.status;
  }

  get startedAt(): Date | null {
    return this.props.startedAt;
  }

  get completedAt(): Date | null {
    return this.props.completedAt;
  }

  get errorMessage(): string | null {
    return this.props.errorMessage;
  }

  get recordsUpserted(): number {
    return this.props.recordsUpserted;
  }

  markRunning(): ScrapeJob {
    if (this.props.status !== ScrapeStatus.PENDING) {
      throw new Error(`Cannot start job in '${this.props.status}' state`);
    }
    return new ScrapeJob({
      ...this.props,
      status: ScrapeStatus.RUNNING,
      startedAt: new Date(),
    });
  }

  markSuccess(recordsUpserted: number): ScrapeJob {
    if (this.props.status !== ScrapeStatus.RUNNING) {
      throw new Error(`Cannot complete job in '${this.props.status}' state`);
    }
    return new ScrapeJob({
      ...this.props,
      status: ScrapeStatus.SUCCESS,
      completedAt: new Date(),
      recordsUpserted,
    });
  }

  markFailed(error: string): ScrapeJob {
    if (this.props.status !== ScrapeStatus.RUNNING) {
      throw new Error(`Cannot fail job in '${this.props.status}' state`);
    }
    return new ScrapeJob({
      ...this.props,
      status: ScrapeStatus.FAILED,
      completedAt: new Date(),
      errorMessage: error,
    });
  }

  toProps(): Readonly<ScrapeJobProps> {
    return { ...this.props };
  }
}
