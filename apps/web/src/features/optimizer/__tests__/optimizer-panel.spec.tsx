import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OptimizerPanel } from '../components/optimizer-panel';
import type { AnalyzedRider, OptimizeResponse } from '@cycling-analyzer/shared-types';

const mockFetch = vi.fn();

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch);
});

afterEach(() => {
  vi.restoreAllMocks();
});

function makeRider(name: string, price = 100): AnalyzedRider {
  return {
    rawName: name,
    rawTeam: 'Team',
    priceHillios: price,
    matchedRider: { id: '1', pcsSlug: 'slug', fullName: name, currentTeam: 'Team' },
    matchConfidence: 0.9,
    unmatched: false,
    compositeScore: 50,
    pointsPerHillio: 0.5,
    totalProjectedPts: 50,
    categoryScores: { gc: 20, stage: 10, mountain: 10, sprint: 5 },
    seasonsUsed: 2,
  };
}

const defaultProps = {
  riders: [makeRider('Rider A'), makeRider('Rider B')],
  budget: 2000,
  mustInclude: [] as string[],
  mustExclude: [] as string[],
  lockedIds: new Set<string>(),
};

describe('OptimizerPanel', () => {
  it('renders the optimize button', () => {
    render(<OptimizerPanel {...defaultProps} />);
    expect(screen.getByText('Get Optimal Team')).toBeInTheDocument();
  });

  it('disables button when no matched riders', () => {
    const riders = [{ ...makeRider('X'), unmatched: true }];
    render(<OptimizerPanel {...defaultProps} riders={riders} />);
    expect(screen.getByText('Get Optimal Team')).toBeDisabled();
  });

  it('shows loading state while optimizing', async () => {
    let resolvePromise: (v: unknown) => void;
    mockFetch.mockReturnValueOnce(
      new Promise((resolve) => {
        resolvePromise = resolve;
      }),
    );

    const user = userEvent.setup();
    render(<OptimizerPanel {...defaultProps} />);

    await user.click(screen.getByText('Get Optimal Team'));

    expect(screen.getByText('Optimizing...')).toBeInTheDocument();

    // Cleanup
    await resolvePromise!({
      ok: true,
      json: () =>
        Promise.resolve({
          optimalTeam: {
            riders: [],
            totalCostHillios: 0,
            totalProjectedPts: 0,
            budgetRemaining: 2000,
            scoreBreakdown: { gc: 0, stage: 0, mountain: 0, sprint: 0 },
          },
          alternativeTeams: [],
        } satisfies OptimizeResponse),
    });
  });
});
