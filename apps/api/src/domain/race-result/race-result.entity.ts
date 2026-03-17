import { randomUUID } from 'node:crypto';
import { RaceType } from '../shared/race-type.enum';
import { RaceClass } from '../shared/race-class.enum';
import { ResultCategory } from '../shared/result-category.enum';

export interface RaceResultProps {
  readonly id: string;
  readonly riderId: string;
  readonly raceSlug: string;
  readonly raceName: string;
  readonly raceType: RaceType;
  readonly raceClass: RaceClass;
  readonly year: number;
  readonly category: ResultCategory;
  readonly position: number | null;
  readonly stageNumber: number | null;
  readonly dnf: boolean;
  readonly scrapedAt: Date;
}

export class RaceResult {
  private constructor(private readonly props: RaceResultProps) {}

  static create(input: Omit<RaceResultProps, 'id'>): RaceResult {
    return new RaceResult({ ...input, id: randomUUID() });
  }

  static reconstitute(props: RaceResultProps): RaceResult {
    return new RaceResult(props);
  }

  get id(): string {
    return this.props.id;
  }

  get riderId(): string {
    return this.props.riderId;
  }

  get raceSlug(): string {
    return this.props.raceSlug;
  }

  get raceName(): string {
    return this.props.raceName;
  }

  get raceType(): RaceType {
    return this.props.raceType;
  }

  get raceClass(): RaceClass {
    return this.props.raceClass;
  }

  get year(): number {
    return this.props.year;
  }

  get category(): ResultCategory {
    return this.props.category;
  }

  get position(): number | null {
    return this.props.position;
  }

  get stageNumber(): number | null {
    return this.props.stageNumber;
  }

  get dnf(): boolean {
    return this.props.dnf;
  }

  get scrapedAt(): Date {
    return this.props.scrapedAt;
  }

  isScoring(): boolean {
    return this.props.position !== null && this.props.position >= 1;
  }

  toProps(): Readonly<RaceResultProps> {
    return { ...this.props };
  }
}
