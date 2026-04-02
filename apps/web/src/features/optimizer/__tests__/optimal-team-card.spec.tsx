import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { OptimalTeamCard } from '../components/optimal-team-card';
import { TooltipProvider } from '@/shared/ui/tooltip';
import type { TeamSelection, AnalyzedRider } from '@cycling-analyzer/shared-types';

function makeRider(name: string, price = 100, score = 50): AnalyzedRider {
  return {
    rawName: name,
    rawTeam: 'Team',
    priceHillios: price,
    matchedRider: null,
    matchConfidence: 0,
    unmatched: false,
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

function renderWithProvider(ui: React.ReactElement) {
  return render(<TooltipProvider>{ui}</TooltipProvider>);
}

describe('OptimalTeamCard', () => {
  it('renders all rider names', () => {
    const team = makeTeam([makeRider('Alice'), makeRider('Bob')]);
    renderWithProvider(<OptimalTeamCard team={team} />);
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
  });

  it('shows total score with pts suffix', () => {
    const team = makeTeam([makeRider('A', 100, 45.5)]);
    renderWithProvider(<OptimalTeamCard team={team} />);
    // Score is displayed as toFixed(0) + " pts"
    expect(screen.getByText('46 pts')).toBeInTheDocument();
  });

  it('renders rider team name', () => {
    const team = makeTeam([makeRider('A')]);
    renderWithProvider(<OptimalTeamCard team={team} />);
    expect(screen.getByText('Team')).toBeInTheDocument();
  });

  it('renders rank badges for each rider', () => {
    const team = makeTeam([makeRider('A'), makeRider('B')]);
    renderWithProvider(<OptimalTeamCard team={team} />);
    expect(screen.getByText('#01')).toBeInTheDocument();
    expect(screen.getByText('#02')).toBeInTheDocument();
  });

  it('applies primary variant styling by default', () => {
    const team = makeTeam([makeRider('Leader')]);
    const { container } = renderWithProvider(<OptimalTeamCard team={team} />);
    // The first rider in primary variant gets a leader gradient with border-l-2
    const leaderEl = container.querySelector('.border-tertiary');
    expect(leaderEl).toBeTruthy();
  });

  it('renders each rider with a test id', () => {
    const team = makeTeam([makeRider('Alice'), makeRider('Bob')]);
    renderWithProvider(<OptimalTeamCard team={team} />);
    expect(screen.getByTestId('optimization-rider-card-Alice')).toBeInTheDocument();
    expect(screen.getByTestId('optimization-rider-card-Bob')).toBeInTheDocument();
  });
});
