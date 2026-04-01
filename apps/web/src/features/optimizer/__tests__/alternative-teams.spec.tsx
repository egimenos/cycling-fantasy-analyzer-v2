import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AlternativeTeams } from '../components/alternative-teams';
import type { TeamSelection, AnalyzedRider } from '@cycling-analyzer/shared-types';

function makeRider(name: string): AnalyzedRider {
  return {
    rawName: name,
    rawTeam: 'Team',
    priceHillios: 100,
    matchedRider: null,
    matchConfidence: 0,
    unmatched: false,
    pointsPerHillio: 0.5,
    totalProjectedPts: 50,
    categoryScores: { gc: 20, stage: 10, mountain: 10, sprint: 5 },
    seasonsUsed: 2,
    seasonBreakdown: null,
    scoringMethod: 'rules' as const,
    mlPredictedScore: null,
  };
}

function makeTeam(pts: number): TeamSelection {
  return {
    riders: [makeRider('Rider')],
    totalCostHillios: 100,
    totalProjectedPts: pts,
    budgetRemaining: 1900,
    scoreBreakdown: { gc: 20, stage: 10, mountain: 10, sprint: 5 },
  };
}

describe('AlternativeTeams', () => {
  it('shows empty message when no alternatives', () => {
    render(<AlternativeTeams teams={[]} budget={2000} />);
    expect(screen.getByText('No alternative teams available.')).toBeInTheDocument();
  });

  it('renders accordion items for each alternative', () => {
    const teams = [makeTeam(45), makeTeam(40)];
    render(<AlternativeTeams teams={teams} budget={2000} />);
    expect(screen.getByText(/Alternative Team #1/)).toBeInTheDocument();
    expect(screen.getByText(/Alternative Team #2/)).toBeInTheDocument();
  });

  it('shows points in trigger label', () => {
    const teams = [makeTeam(42.3)];
    render(<AlternativeTeams teams={teams} budget={2000} />);
    expect(screen.getByText(/42\.3 pts/)).toBeInTheDocument();
  });
});
