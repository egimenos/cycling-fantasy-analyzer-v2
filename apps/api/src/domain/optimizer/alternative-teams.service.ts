import { ScoredRider, TeamSelection } from './types';
import { findOptimalTeam } from './knapsack.service';

function canonicalKey(riders: ScoredRider[]): string {
  return riders
    .map((r) => r.id)
    .sort()
    .join(',');
}

export function findAlternativeTeams(
  riders: ScoredRider[],
  budget: number,
  teamSize: number,
  optimalTeam: TeamSelection,
  count: number,
): TeamSelection[] {
  if (count <= 0 || riders.length <= teamSize) {
    return [];
  }

  const seen = new Set<string>();
  seen.add(canonicalKey(optimalTeam.riders));

  const candidates: TeamSelection[] = [];

  for (const excludedRider of optimalTeam.riders) {
    const filteredPool = riders.filter((r) => r.id !== excludedRider.id);

    try {
      const team = findOptimalTeam(filteredPool, budget, teamSize);
      const key = canonicalKey(team.riders);

      if (!seen.has(key)) {
        seen.add(key);
        candidates.push(team);
      }
    } catch {
      // If no valid team can be formed, skip this exclusion
      continue;
    }
  }

  candidates.sort((a, b) => b.totalProjectedPts - a.totalProjectedPts);

  return candidates.slice(0, count);
}
