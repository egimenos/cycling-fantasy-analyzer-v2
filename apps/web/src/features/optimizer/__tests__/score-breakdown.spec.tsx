import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ScoreBreakdown } from '../components/score-breakdown';
import type { CategoryScores } from '@cycling-analyzer/shared-types';

describe('ScoreBreakdown', () => {
  it('renders all category labels', () => {
    const breakdown: CategoryScores = { gc: 20, stage: 10, mountain: 10, sprint: 5 };
    render(<ScoreBreakdown breakdown={breakdown} />);
    expect(screen.getByText('GC')).toBeInTheDocument();
    expect(screen.getByText('Stage')).toBeInTheDocument();
    expect(screen.getByText('Mountain')).toBeInTheDocument();
    expect(screen.getByText('Sprint')).toBeInTheDocument();
  });

  it('renders formatted values', () => {
    const breakdown: CategoryScores = {
      gc: 25.3,
      stage: 12.7,
      mountain: 8.1,
      sprint: 3.9,
    };
    render(<ScoreBreakdown breakdown={breakdown} />);
    expect(screen.getByText('25.3')).toBeInTheDocument();
    expect(screen.getByText('12.7')).toBeInTheDocument();
  });

  it('handles all-zero breakdown without crashing', () => {
    const breakdown: CategoryScores = { gc: 0, stage: 0, mountain: 0, sprint: 0 };
    render(<ScoreBreakdown breakdown={breakdown} />);
    expect(screen.getByText('GC')).toBeInTheDocument();
  });
});
