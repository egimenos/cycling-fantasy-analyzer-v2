import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TeamBuilderPanel } from '../components/team-builder-panel';
import type { AnalyzedRider } from '@cycling-analyzer/shared-types';

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
  };
}

const defaultProps = {
  selectedRiders: [] as AnalyzedRider[],
  totalCost: 0,
  totalScore: 0,
  budgetRemaining: 2000,
  budget: 2000,
  isTeamComplete: false,
  onRemoveRider: vi.fn(),
  onClearAll: vi.fn(),
};

describe('TeamBuilderPanel', () => {
  it('shows empty state when no riders selected', () => {
    render(<TeamBuilderPanel {...defaultProps} />);
    expect(screen.getByText(/Select riders from the table/)).toBeInTheDocument();
  });

  it('shows rider count', () => {
    render(<TeamBuilderPanel {...defaultProps} />);
    expect(screen.getByText(/Team Builder \(0 \/ 9\)/)).toBeInTheDocument();
  });

  it('lists selected riders', () => {
    const riders = [makeRider('Alice'), makeRider('Bob')];
    render(
      <TeamBuilderPanel
        {...defaultProps}
        selectedRiders={riders}
        totalCost={200}
        totalScore={100}
      />,
    );
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
  });

  it('shows remaining rider count', () => {
    render(
      <TeamBuilderPanel
        {...defaultProps}
        selectedRiders={[makeRider('A'), makeRider('B')]}
        totalCost={200}
        totalScore={100}
      />,
    );
    expect(screen.getByText(/7 more riders needed/)).toBeInTheDocument();
  });

  it('calls onRemoveRider when X is clicked', async () => {
    const onRemove = vi.fn();
    const user = userEvent.setup();
    render(
      <TeamBuilderPanel
        {...defaultProps}
        selectedRiders={[makeRider('Alice')]}
        totalCost={100}
        totalScore={50}
        onRemoveRider={onRemove}
      />,
    );

    await user.click(screen.getByLabelText('Remove Alice'));
    expect(onRemove).toHaveBeenCalledWith('Alice');
  });

  it('calls onClearAll when Clear is clicked', async () => {
    const onClear = vi.fn();
    const user = userEvent.setup();
    render(
      <TeamBuilderPanel
        {...defaultProps}
        selectedRiders={[makeRider('Alice')]}
        totalCost={100}
        totalScore={50}
        onClearAll={onClear}
      />,
    );

    await user.click(screen.getByText('Clear'));
    expect(onClear).toHaveBeenCalled();
  });

  it('shows budget exceeded warning', () => {
    render(
      <TeamBuilderPanel
        {...defaultProps}
        selectedRiders={[makeRider('A')]}
        totalCost={100}
        totalScore={50}
        budgetRemaining={-50}
      />,
    );
    expect(screen.getByText('Budget exceeded!')).toBeInTheDocument();
  });

  it('renders TeamSummary when team is complete', () => {
    const riders = Array.from({ length: 9 }, (_, i) => makeRider(`R${i}`));
    render(
      <TeamBuilderPanel
        {...defaultProps}
        selectedRiders={riders}
        totalCost={900}
        totalScore={450}
        isTeamComplete={true}
      />,
    );
    expect(screen.getByText('Team Complete!')).toBeInTheDocument();
  });
});
