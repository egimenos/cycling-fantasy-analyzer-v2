import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { OptimalTeamCard } from '../components/optimal-team-card';
import type { TeamSelection, AnalyzedRider } from '@cycling-analyzer/shared-types';

function makeRider(name: string, price = 100, score = 50): AnalyzedRider {
  return {
    rawName: name,
    rawTeam: 'Team',
    priceHillios: price,
    matchedRider: null,
    matchConfidence: 0,
    unmatched: false,
    compositeScore: score,
    pointsPerHillio: score / price,
    totalProjectedPts: score,
    categoryScores: { gc: 20, stage: 10, mountain: 10, sprint: 5 },
    seasonsUsed: 2,
    seasonBreakdown: null,
    scoringMethod: 'rules' as const,
    mlPredictedScore: null,
  };
}

function makeTeam(riders: AnalyzedRider[]): TeamSelection {
  const totalCost = riders.reduce((s, r) => s + r.priceHillios, 0);
  const totalPts = riders.reduce((s, r) => s + (r.totalProjectedPts ?? 0), 0);
  return {
    riders,
    totalCostHillios: totalCost,
    totalProjectedPts: totalPts,
    budgetRemaining: 2000 - totalCost,
    scoreBreakdown: { gc: 20, stage: 10, mountain: 10, sprint: 5 },
  };
}

describe('OptimalTeamCard', () => {
  it('renders all rider names', () => {
    const team = makeTeam([makeRider('Alice'), makeRider('Bob')]);
    render(<OptimalTeamCard team={team} budget={2000} />);
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
  });

  it('shows total score', () => {
    const team = makeTeam([makeRider('A', 100, 45.5)]);
    render(<OptimalTeamCard team={team} budget={2000} />);
    const scores = screen.getAllByText('45.5');
    expect(scores.length).toBeGreaterThanOrEqual(1);
  });

  it('renders default title "Optimal Team"', () => {
    const team = makeTeam([makeRider('A')]);
    render(<OptimalTeamCard team={team} budget={2000} />);
    expect(screen.getByText('Optimal Team')).toBeInTheDocument();
  });

  it('renders custom title', () => {
    const team = makeTeam([makeRider('A')]);
    render(<OptimalTeamCard team={team} budget={2000} title="Alt Team #1" />);
    expect(screen.getByText('Alt Team #1')).toBeInTheDocument();
  });

  it('highlights locked riders', () => {
    const team = makeTeam([makeRider('Locked'), makeRider('Free')]);
    const { container } = render(
      <OptimalTeamCard team={team} budget={2000} lockedIds={new Set(['Locked'])} />,
    );
    const lockedRow = container.querySelector('.border-green-500');
    expect(lockedRow).toBeTruthy();
  });

  it('renders score breakdown bars', () => {
    const team = makeTeam([makeRider('A')]);
    render(<OptimalTeamCard team={team} budget={2000} />);
    expect(screen.getByText('GC')).toBeInTheDocument();
    expect(screen.getByText('Stage')).toBeInTheDocument();
  });
});
