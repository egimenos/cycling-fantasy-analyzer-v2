import fuzzysort from 'fuzzysort';
import {
  RiderMatcherPort,
  RiderMatchResult,
  RiderTarget,
} from '../../domain/matching/rider-matcher.port';

interface NormalizedTarget {
  id: string;
  normalizedName: string;
  currentTeam: string;
}

function normalizeText(str: string): string {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export class FuzzysortMatcherAdapter implements RiderMatcherPort {
  private targets: NormalizedTarget[] = [];
  private readonly threshold: number;

  constructor(threshold = 0.3) {
    this.threshold = threshold;
  }

  loadRiders(riders: RiderTarget[]): void {
    this.targets = riders.map((r) => ({
      id: r.id,
      normalizedName: normalizeText(r.normalizedName),
      currentTeam: normalizeText(r.currentTeam),
    }));
  }

  async matchRider(rawName: string, rawTeam: string): Promise<RiderMatchResult> {
    if (this.targets.length === 0) {
      return { matchedRiderId: null, confidence: 0, unmatched: true };
    }

    const normalizedQuery = normalizeText(rawName);

    if (normalizedQuery === '') {
      return { matchedRiderId: null, confidence: 0, unmatched: true };
    }

    const results = fuzzysort.go(normalizedQuery, this.targets, {
      keys: ['normalizedName', 'currentTeam'],
      threshold: this.threshold,
      scoreFn: (keysResult) => {
        const nameScore = keysResult[0]?.score ?? 0;
        const teamScore = keysResult[1]?.score ?? 0;

        const normalizedTeam = normalizeText(rawTeam);
        const teamBonus = normalizedTeam !== '' && teamScore > 0.3 ? teamScore * 0.15 : 0;

        return Math.min(nameScore + teamBonus, 1);
      },
    });

    if (results.length === 0) {
      return { matchedRiderId: null, confidence: 0, unmatched: true };
    }

    const best = results[0];
    return {
      matchedRiderId: best.obj.id,
      confidence: best.score,
      unmatched: false,
    };
  }
}
