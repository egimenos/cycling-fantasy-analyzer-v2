import { randomUUID } from 'node:crypto';

export interface StartlistEntryProps {
  readonly id: string;
  readonly raceSlug: string;
  readonly year: number;
  readonly riderId: string;
  readonly teamName: string | null;
  readonly bibNumber: number | null;
  readonly scrapedAt: Date;
}

export class StartlistEntry {
  private constructor(private readonly props: StartlistEntryProps) {}

  static create(input: Omit<StartlistEntryProps, 'id'>): StartlistEntry {
    return new StartlistEntry({ ...input, id: randomUUID() });
  }

  static reconstitute(props: StartlistEntryProps): StartlistEntry {
    return new StartlistEntry(props);
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

  get riderId(): string {
    return this.props.riderId;
  }

  get teamName(): string | null {
    return this.props.teamName;
  }

  get bibNumber(): number | null {
    return this.props.bibNumber;
  }

  get scrapedAt(): Date {
    return this.props.scrapedAt;
  }

  toProps(): Readonly<StartlistEntryProps> {
    return { ...this.props };
  }
}
