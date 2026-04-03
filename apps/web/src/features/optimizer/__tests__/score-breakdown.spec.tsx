import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ScoreBreakdown } from '../components/score-breakdown';
import { TooltipProvider } from '@/shared/ui/tooltip';
import type { CategoryScores } from '@cycling-analyzer/shared-types';

function renderWithProvider(ui: React.ReactElement) {
  return render(<TooltipProvider>{ui}</TooltipProvider>);
}

describe('ScoreBreakdown', () => {
  it('renders all category labels', () => {
    const breakdown: CategoryScores = {
      gc: 20,
      stage: 10,
      mountain: 10,
      sprint: 5,
      gc_daily: 0,
      mountain_pass: 0,
      sprint_intermediate: 0,
      regularidad_daily: 0,
    };
    renderWithProvider(<ScoreBreakdown breakdown={breakdown} />);
    expect(screen.getByText('GC')).toBeInTheDocument();
    expect(screen.getByText('STAGE')).toBeInTheDocument();
    expect(screen.getByText('MOUNTAIN')).toBeInTheDocument();
    expect(screen.getByText('SPRINT')).toBeInTheDocument();
  });

  it('renders percentage values in the legend', () => {
    const breakdown: CategoryScores = {
      gc: 25.3,
      stage: 12.7,
      mountain: 8.1,
      sprint: 3.9,
      gc_daily: 0,
      mountain_pass: 0,
      sprint_intermediate: 0,
      regularidad_daily: 0,
    };
    renderWithProvider(<ScoreBreakdown breakdown={breakdown} />);
    // Percentage appears in both the legend and the bar segment
    const total = 25.3 + 12.7 + 8.1 + 3.9;
    const gcPct = Math.round((25.3 / total) * 100);
    const matches = screen.getAllByText(`${gcPct}%`);
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  it('handles all-zero breakdown without crashing', () => {
    const breakdown: CategoryScores = {
      gc: 0,
      stage: 0,
      mountain: 0,
      sprint: 0,
      gc_daily: 0,
      mountain_pass: 0,
      sprint_intermediate: 0,
      regularidad_daily: 0,
    };
    renderWithProvider(<ScoreBreakdown breakdown={breakdown} />);
    expect(screen.getByText('GC')).toBeInTheDocument();
  });

  it('renders the Point Distribution Analysis label', () => {
    const breakdown: CategoryScores = {
      gc: 20,
      stage: 10,
      mountain: 10,
      sprint: 5,
      gc_daily: 0,
      mountain_pass: 0,
      sprint_intermediate: 0,
      regularidad_daily: 0,
    };
    renderWithProvider(<ScoreBreakdown breakdown={breakdown} />);
    expect(screen.getByText('Point Distribution Analysis')).toBeInTheDocument();
  });
});
