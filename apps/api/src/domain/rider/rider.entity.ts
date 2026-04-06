import { randomUUID } from 'node:crypto';

export interface RiderProps {
  readonly id: string;
  readonly pcsSlug: string;
  readonly fullName: string;
  readonly normalizedName: string;
  readonly currentTeam: string | null;
  readonly nationality: string | null;
  readonly birthDate: Date | null;
  readonly lastScrapedAt: Date | null;
}

export class Rider {
  private constructor(private readonly props: RiderProps) {}

  static create(input: Omit<RiderProps, 'id' | 'normalizedName'>): Rider {
    return new Rider({
      ...input,
      id: randomUUID(),
      normalizedName: Rider.normalizeName(input.fullName),
    });
  }

  static reconstitute(props: RiderProps): Rider {
    return new Rider(props);
  }

  get id(): string {
    return this.props.id;
  }

  get pcsSlug(): string {
    return this.props.pcsSlug;
  }

  get fullName(): string {
    return this.props.fullName;
  }

  get normalizedName(): string {
    return this.props.normalizedName;
  }

  get currentTeam(): string | null {
    return this.props.currentTeam;
  }

  get nationality(): string | null {
    return this.props.nationality;
  }

  get birthDate(): Date | null {
    return this.props.birthDate;
  }

  get lastScrapedAt(): Date | null {
    return this.props.lastScrapedAt;
  }

  updateTeam(team: string): Rider {
    return new Rider({ ...this.props, currentTeam: team });
  }

  markScraped(at: Date = new Date()): Rider {
    return new Rider({ ...this.props, lastScrapedAt: at });
  }

  toProps(): Readonly<RiderProps> {
    return { ...this.props };
  }

  private static normalizeName(name: string): string {
    return name
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
}
