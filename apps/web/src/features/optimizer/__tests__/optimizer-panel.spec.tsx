import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OptimizerPanel } from '../components/optimizer-panel';
import { TooltipProvider } from '@/shared/ui/tooltip';
import type { AnalyzedRider, OptimizeResponse } from '@cycling-analyzer/shared-types';

function makeRider(name: string, price = 100): AnalyzedRider {
  return {
    rawName: name,
    rawTeam: 'Team',
    priceHillios: price,
    matchedRider: { id: '1', pcsSlug: 'slug', fullName: name, currentTeam: 'Team' },
    matchConfidence: 0.9,
    unmatched: false,
    pointsPerHillio: 0.5,
    totalProjectedPts: 50,
    categoryScores: {
      gc: 20,
      stage: 10,
      mountain: 10,
      sprint: 5,
      gc_daily: 0,
      mountain_pass: 0,
      sprint_intermediate: 0,
      regularidad_daily: 0,
    },
    breakout: null,
    sameRaceHistory: null,
  };
}

function makeOptimizeResponse(riders: AnalyzedRider[]): OptimizeResponse {
  const totalCost = riders.reduce((s, r) => s + r.priceHillios, 0);
  const totalPts = riders.reduce((s, r) => s + (r.totalProjectedPts ?? 0), 0);
  return {
    optimalTeam: {
      riders,
      totalCostHillios: totalCost,
      totalProjectedPts: totalPts,
      budgetRemaining: 2000 - totalCost,
      scoreBreakdown: {
        gc: 20,
        stage: 10,
        mountain: 10,
        sprint: 5,
        gc_daily: 0,
        mountain_pass: 0,
        sprint_intermediate: 0,
        regularidad_daily: 0,
      },
    },
    alternativeTeams: [],
  };
}

function renderWithProvider(ui: React.ReactElement) {
  return render(<TooltipProvider>{ui}</TooltipProvider>);
}

describe('OptimizerPanel', () => {
  it('renders the optimization results header', () => {
    const data = makeOptimizeResponse([makeRider('Rider A'), makeRider('Rider B')]);
    renderWithProvider(<OptimizerPanel data={data} budget={2000} onApplyToRoster={vi.fn()} />);
    expect(screen.getByText('OPTIMAL CONFIGURATION')).toBeInTheDocument();
  });

  it('renders the Apply to Roster button', () => {
    const data = makeOptimizeResponse([makeRider('Rider A')]);
    renderWithProvider(<OptimizerPanel data={data} budget={2000} onApplyToRoster={vi.fn()} />);
    expect(screen.getByTestId('optimization-apply-btn')).toBeInTheDocument();
    expect(screen.getByText('Apply to Roster')).toBeInTheDocument();
  });

  it('calls onApplyToRoster when button is clicked', async () => {
    const onApply = vi.fn();
    const data = makeOptimizeResponse([makeRider('Rider A')]);
    renderWithProvider(<OptimizerPanel data={data} budget={2000} onApplyToRoster={onApply} />);

    const user = userEvent.setup();
    await user.click(screen.getByText('Apply to Roster'));

    expect(onApply).toHaveBeenCalledOnce();
  });

  it('renders the Primary Lineup section', () => {
    const data = makeOptimizeResponse([makeRider('Rider A')]);
    renderWithProvider(<OptimizerPanel data={data} budget={2000} onApplyToRoster={vi.fn()} />);
    expect(screen.getByTestId('optimization-lineup')).toBeInTheDocument();
    expect(screen.getByText('Primary Lineup')).toBeInTheDocument();
  });

  it('renders the score breakdown section', () => {
    const data = makeOptimizeResponse([makeRider('Rider A')]);
    renderWithProvider(<OptimizerPanel data={data} budget={2000} onApplyToRoster={vi.fn()} />);
    expect(screen.getByTestId('optimization-score-breakdown')).toBeInTheDocument();
  });
});
