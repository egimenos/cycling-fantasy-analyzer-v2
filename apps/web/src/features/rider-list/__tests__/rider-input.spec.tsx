import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RiderInput, parseRiderLines } from '../components/rider-input';

// Mock the api-client module
vi.mock('@/shared/lib/api-client', () => ({
  fetchRaceProfile: vi.fn(),
}));

import { fetchRaceProfile } from '@/shared/lib/api-client';
const mockFetchRaceProfile = vi.mocked(fetchRaceProfile);

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
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockFetchRaceProfile.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('disables Analyze button when no valid riders', () => {
    render(<RiderInput onAnalyze={vi.fn()} isLoading={false} />);
    expect(screen.getByRole('button', { name: 'Analyze' })).toBeDisabled();
  });

  it('enables Analyze button when valid riders entered', async () => {
    vi.useRealTimers();
    const user = userEvent.setup();
    render(<RiderInput onAnalyze={vi.fn()} isLoading={false} />);
    await user.type(screen.getByLabelText('Rider List'), 'Pogačar, UAE, 700');
    expect(screen.getByRole('button', { name: 'Analyze' })).toBeEnabled();
  });

  it('shows loading state', () => {
    render(<RiderInput onAnalyze={vi.fn()} isLoading={true} />);
    expect(screen.getByRole('button', { name: /analyzing/i })).toBeDisabled();
  });

  it('shows hint text when no URL entered', () => {
    render(<RiderInput onAnalyze={vi.fn()} isLoading={false} />);
    expect(screen.getByText(/enter a pcs race url/i)).toBeInTheDocument();
  });

  it('has PCS URL input field', () => {
    render(<RiderInput onAnalyze={vi.fn()} isLoading={false} />);
    expect(screen.getByLabelText('PCS Race URL')).toBeInTheDocument();
  });

  it('calls onAnalyze with default race type when no profile fetched', async () => {
    vi.useRealTimers();
    const user = userEvent.setup();
    const onAnalyze = vi.fn();
    render(<RiderInput onAnalyze={onAnalyze} isLoading={false} />);

    await user.type(screen.getByLabelText('Rider List'), 'Pogačar, UAE, 700');
    await user.click(screen.getByRole('button', { name: 'Analyze' }));

    expect(onAnalyze).toHaveBeenCalledWith(
      [{ name: 'Pogačar', team: 'UAE', price: 700 }],
      'grand_tour',
      2000,
      3,
    );
  });

  it('shows valid rider count', async () => {
    vi.useRealTimers();
    const user = userEvent.setup();
    render(<RiderInput onAnalyze={vi.fn()} isLoading={false} />);
    await user.type(
      screen.getByLabelText('Rider List'),
      'Pogačar, UAE, 700\nVingegaard, Visma, 650',
    );
    expect(screen.getByText('2 valid riders')).toBeInTheDocument();
  });

  it('shows profile summary after successful fetch', async () => {
    mockFetchRaceProfile.mockResolvedValueOnce({
      status: 'success',
      data: {
        raceSlug: 'tour-de-france',
        raceName: 'Tour De France',
        raceType: 'grand_tour',
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
    });

    render(<RiderInput onAnalyze={vi.fn()} isLoading={false} />);

    const urlInput = screen.getByLabelText('PCS Race URL');
    await userEvent
      .setup({ advanceTimers: vi.advanceTimersByTime })
      .type(urlInput, 'https://www.procyclingstats.com/race/tour-de-france/2025');

    // Advance past debounce
    await vi.advanceTimersByTimeAsync(600);

    await waitFor(() => {
      expect(screen.getByText('Tour De France')).toBeInTheDocument();
    });

    expect(screen.getByText('21 stages')).toBeInTheDocument();
  });

  it('shows error when profile fetch fails', async () => {
    mockFetchRaceProfile.mockResolvedValueOnce({
      status: 'error',
      error: 'Not found',
    });

    render(<RiderInput onAnalyze={vi.fn()} isLoading={false} />);

    const urlInput = screen.getByLabelText('PCS Race URL');
    await userEvent
      .setup({ advanceTimers: vi.advanceTimersByTime })
      .type(urlInput, 'https://www.procyclingstats.com/race/unknown-race/2025');

    await vi.advanceTimersByTimeAsync(600);

    await waitFor(() => {
      expect(screen.getByText(/could not fetch race profile/i)).toBeInTheDocument();
    });
  });
});
