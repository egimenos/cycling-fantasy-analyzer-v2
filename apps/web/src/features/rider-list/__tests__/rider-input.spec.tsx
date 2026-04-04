import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { RiderInput, parseRiderLines } from '../components/rider-input';
import { RaceType } from '@cycling-analyzer/shared-types';
import type { useRaceProfile } from '../hooks/use-race-profile';

// Mock api-client (importPriceList is used by the component)
vi.mock('@/shared/lib/api-client', () => ({
  fetchRaceProfile: vi.fn(),
  importPriceList: vi.fn(),
}));

// Default idle profile state
const idleProfile: ReturnType<typeof useRaceProfile> = { status: 'idle' };

/**
 * Wrapper that manages controlled state for the RiderInput component,
 * since text/raceUrl/gameUrl/budget are now lifted to the parent.
 */
function RiderInputWrapper({
  onAnalyze,
  isLoading,
  profileState = idleProfile,
}: {
  onAnalyze: (...args: unknown[]) => void;
  isLoading: boolean;
  profileState?: ReturnType<typeof useRaceProfile>;
}) {
  const [text, setText] = useState('');
  const [raceUrl, setRaceUrl] = useState('');
  const [gameUrl, setGameUrl] = useState('');
  const [budget, setBudget] = useState(2000);

  return (
    <RiderInput
      onAnalyze={onAnalyze}
      isLoading={isLoading}
      text={text}
      onTextChange={setText}
      raceUrl={raceUrl}
      onRaceUrlChange={setRaceUrl}
      gameUrl={gameUrl}
      onGameUrlChange={setGameUrl}
      budget={budget}
      onBudgetChange={setBudget}
      profileState={profileState}
      races={[]}
      raceCatalogLoading={false}
      selectedRace={null}
      onRaceSelect={() => {}}
      gmvImportState={{ status: 'idle' }}
    />
  );
}

describe('parseRiderLines', () => {
  it('parses valid CSV lines', () => {
    const result = parseRiderLines('Pogačar, UAE, 700\nVingegaard, Visma, 650');
    expect(result).toEqual([
      { name: 'Pogačar', team: 'UAE', price: 700 },
      { name: 'Vingegaard', team: 'Visma', price: 650 },
    ]);
  });

  it('filters out invalid lines', () => {
    const result = parseRiderLines('Pogačar, UAE, 700\ninvalid line\n, , 0');
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Pogačar');
  });

  it('handles tab-separated values', () => {
    const result = parseRiderLines('Pogačar\tUAE\t700');
    expect(result).toEqual([{ name: 'Pogačar', team: 'UAE', price: 700 }]);
  });

  it('returns empty array for empty input', () => {
    expect(parseRiderLines('')).toEqual([]);
  });

  it('filters lines with negative prices', () => {
    const result = parseRiderLines('Rider, Team, -100');
    expect(result).toEqual([]);
  });
});

describe('RiderInput', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('disables Analyze button when no valid riders', () => {
    render(<RiderInputWrapper onAnalyze={vi.fn()} isLoading={false} />);
    expect(screen.getByTestId('setup-analyze-btn')).toBeDisabled();
  });

  it('enables Analyze button when valid riders entered', async () => {
    const user = userEvent.setup();
    render(<RiderInputWrapper onAnalyze={vi.fn()} isLoading={false} />);
    await user.type(screen.getByTestId('setup-riders-textarea'), 'Pogačar, UAE, 700');
    expect(screen.getByTestId('setup-analyze-btn')).toBeEnabled();
  });

  it('shows loading state', () => {
    render(<RiderInputWrapper onAnalyze={vi.fn()} isLoading={true} />);
    const btn = screen.getByTestId('setup-analyze-btn');
    expect(btn).toBeDisabled();
    expect(btn).toHaveTextContent(/analyzing/i);
  });

  it('has Race URL input field', () => {
    render(<RiderInputWrapper onAnalyze={vi.fn()} isLoading={false} />);
    expect(screen.getByTestId('setup-race-url-input')).toBeInTheDocument();
  });

  it('calls onAnalyze with default race type when no profile fetched', async () => {
    const user = userEvent.setup();
    const onAnalyze = vi.fn();
    render(<RiderInputWrapper onAnalyze={onAnalyze} isLoading={false} />);

    await user.type(screen.getByTestId('setup-riders-textarea'), 'Pogačar, UAE, 700');
    await user.click(screen.getByTestId('setup-analyze-btn'));

    expect(onAnalyze).toHaveBeenCalledWith(
      [{ name: 'Pogačar', team: 'UAE', price: 700 }],
      'grand_tour',
      2000,
      undefined,
      undefined,
      undefined,
    );
  });

  it('shows valid rider count', async () => {
    const user = userEvent.setup();
    render(<RiderInputWrapper onAnalyze={vi.fn()} isLoading={false} />);
    await user.type(
      screen.getByTestId('setup-riders-textarea'),
      'Pogačar, UAE, 700\nVingegaard, Visma, 650',
    );
    expect(screen.getByTestId('setup-valid-count')).toHaveTextContent('2 valid');
  });

  it('shows profile summary when profileState is success', () => {
    const successProfile: ReturnType<typeof useRaceProfile> = {
      status: 'success',
      data: {
        raceSlug: 'tour-de-france',
        raceName: 'Tour De France',
        raceType: RaceType.GRAND_TOUR,
        year: 2025,
        totalStages: 21,
        stages: [],
        profileSummary: {
          p1Count: 6,
          p2Count: 3,
          p3Count: 2,
          p4Count: 3,
          p5Count: 5,
          ittCount: 2,
          tttCount: 0,
          unknownCount: 0,
        },
      },
    };

    render(
      <RiderInputWrapper onAnalyze={vi.fn()} isLoading={false} profileState={successProfile} />,
    );

    expect(screen.getByTestId('race-profile-name')).toHaveTextContent('Tour De France');
    // totalStages is rendered as separate spans: "21" and "stages"
    expect(screen.getByText('21')).toBeInTheDocument();
    expect(screen.getByText('stages')).toBeInTheDocument();
  });

  it('shows error when profileState is error', () => {
    const errorProfile: ReturnType<typeof useRaceProfile> = {
      status: 'error',
      error: 'Not found',
    };

    render(<RiderInputWrapper onAnalyze={vi.fn()} isLoading={false} profileState={errorProfile} />);

    expect(screen.getByText(/could not fetch race profile/i)).toBeInTheDocument();
  });
});
