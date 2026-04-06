import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TooltipProvider } from '@/shared/ui/tooltip';
import { RiderTable } from '../components/rider-table';
import type { AnalyzedRider, AnalyzeResponse } from '@cycling-analyzer/shared-types';

function makeRider(overrides: Partial<AnalyzedRider> = {}): AnalyzedRider {
  return {
    rawName: 'Tadej Pogačar',
    rawTeam: 'UAE',
    priceHillios: 700,
    matchedRider: {
      id: '1',
      pcsSlug: 'tadej-pogacar',
      fullName: 'Tadej Pogačar',
      currentTeam: 'UAE Team Emirates',
    },
    matchConfidence: 0.95,
    pointsPerHillio: 0.12,
    totalProjectedPts: 85,
    categoryScores: {
      gc: 40,
      stage: 20,
      mountain: 10,
      sprint: 5,
      gc_daily: 0,
      mountain_pass: 0,
      sprint_intermediate: 0,
      regularidad_daily: 0,
    },
    unmatched: false,
    breakout: null,
    sameRaceHistory: null,
    seasonBreakdowns: null,
    ...overrides,
  };
}

function makeResponse(riders: AnalyzedRider[]): AnalyzeResponse {
  const matched = riders.filter((r) => !r.unmatched).length;
  return {
    riders,
    totalSubmitted: riders.length,
    totalMatched: matched,
    unmatchedCount: riders.length - matched,
  };
}

const defaultProps = {
  lockedIds: new Set<string>(),
  excludedIds: new Set<string>(),
  selectedNames: new Set<string>(),
  onToggleLock: vi.fn(),
  onToggleExclude: vi.fn(),
  onToggleSelect: vi.fn(),
  canSelect: () => true,
};

function renderTable(ui: React.ReactElement) {
  return render(<TooltipProvider>{ui}</TooltipProvider>);
}

describe('RiderTable', () => {
  it('renders rider rows', () => {
    const data = makeResponse([
      makeRider(),
      makeRider({ rawName: 'Jonas Vingegaard', rawTeam: 'Visma' }),
    ]);
    renderTable(<RiderTable data={data} {...defaultProps} />);
    expect(screen.getByText('Tadej Pogačar')).toBeInTheDocument();
    expect(screen.getByText('Jonas Vingegaard')).toBeInTheDocument();
  });

  it('shows rider count summary', () => {
    const data = makeResponse([makeRider(), makeRider({ unmatched: true, rawName: 'Unknown' })]);
    renderTable(<RiderTable data={data} {...defaultProps} />);
    expect(screen.getByText(/Showing 2 of 2/)).toBeInTheDocument();
  });

  it('shows empty state for zero riders', () => {
    const data = makeResponse([]);
    renderTable(<RiderTable data={data} {...defaultProps} />);
    expect(screen.getByText('No riders')).toBeInTheDocument();
  });

  it('shows UNMATCHED badge for unmatched riders', () => {
    const data = makeResponse([
      makeRider({
        unmatched: true,
        rawName: 'Unknown Rider',
        matchedRider: null,
        totalProjectedPts: null,
        categoryScores: null,
      }),
    ]);
    renderTable(<RiderTable data={data} {...defaultProps} />);
    expect(screen.getByText('UNMATCHED')).toBeInTheDocument();
  });

  it('shows MATCH badge for matched riders', () => {
    const data = makeResponse([makeRider()]);
    renderTable(<RiderTable data={data} {...defaultProps} />);
    expect(screen.getByText('MATCH')).toBeInTheDocument();
  });

  it('expands row on click to show breakdown', async () => {
    const user = userEvent.setup();
    const data = makeResponse([makeRider()]);
    renderTable(<RiderTable data={data} {...defaultProps} />);

    await user.click(screen.getByText('Tadej Pogačar'));

    expect(screen.getByText('GC')).toBeInTheDocument();
    expect(screen.getByText('40.0')).toBeInTheDocument();
    expect(screen.getByText(/confidence: 95%/)).toBeInTheDocument();
  });

  it('shows "no match" message for expanded unmatched rider', async () => {
    const user = userEvent.setup();
    const data = makeResponse([
      makeRider({
        unmatched: true,
        rawName: 'Ghost Rider',
        matchedRider: null,
        totalProjectedPts: null,
        categoryScores: null,
      }),
    ]);
    renderTable(<RiderTable data={data} {...defaultProps} />);

    await user.click(screen.getByText('Ghost Rider'));

    expect(screen.getByText(/No match found in database/)).toBeInTheDocument();
  });

  it('renders checkbox for each rider', () => {
    const data = makeResponse([makeRider()]);
    renderTable(<RiderTable data={data} {...defaultProps} />);
    expect(screen.getByLabelText('Select Tadej Pogačar')).toBeInTheDocument();
  });

  it('renders lock and exclude buttons', () => {
    const data = makeResponse([makeRider()]);
    renderTable(<RiderTable data={data} {...defaultProps} />);
    expect(screen.getByLabelText('Lock Tadej Pogačar')).toBeInTheDocument();
    expect(screen.getByLabelText('Exclude Tadej Pogačar')).toBeInTheDocument();
  });

  it('applies locked row styling', () => {
    const data = makeResponse([makeRider()]);
    renderTable(
      <RiderTable data={data} {...defaultProps} lockedIds={new Set(['Tadej Pogačar'])} />,
    );
    expect(screen.getByLabelText('Unlock Tadej Pogačar')).toBeInTheDocument();
  });

  it('applies excluded row styling with line-through', () => {
    const data = makeResponse([makeRider()]);
    renderTable(
      <RiderTable data={data} {...defaultProps} excludedIds={new Set(['Tadej Pogačar'])} />,
    );
    expect(screen.getByLabelText('Include Tadej Pogačar')).toBeInTheDocument();
    const nameEl = screen.getByText('Tadej Pogačar');
    expect(nameEl.className).toContain('line-through');
  });
});
