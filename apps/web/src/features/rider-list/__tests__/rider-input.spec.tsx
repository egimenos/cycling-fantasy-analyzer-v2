import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RiderInput, parseRiderLines } from '../components/rider-input';

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
  it('disables Analyze button when no valid riders', () => {
    render(<RiderInput onAnalyze={vi.fn()} isLoading={false} />);
    expect(screen.getByRole('button', { name: 'Analyze' })).toBeDisabled();
  });

  it('enables Analyze button when valid riders entered', async () => {
    const user = userEvent.setup();
    render(<RiderInput onAnalyze={vi.fn()} isLoading={false} />);
    await user.type(screen.getByLabelText('Rider List'), 'Pogačar, UAE, 700');
    expect(screen.getByRole('button', { name: 'Analyze' })).toBeEnabled();
  });

  it('shows loading state', () => {
    render(<RiderInput onAnalyze={vi.fn()} isLoading={true} />);
    expect(screen.getByRole('button', { name: /analyzing/i })).toBeDisabled();
  });

  it('calls onAnalyze with parsed riders on submit', async () => {
    const user = userEvent.setup();
    const onAnalyze = vi.fn();
    render(<RiderInput onAnalyze={onAnalyze} isLoading={false} />);

    await user.type(screen.getByLabelText('Rider List'), 'Pogačar, UAE, 700');
    await user.click(screen.getByRole('button', { name: 'Analyze' }));

    expect(onAnalyze).toHaveBeenCalledWith(
      [{ name: 'Pogačar', team: 'UAE', price: 700 }],
      'grand_tour',
      2000,
    );
  });

  it('shows valid rider count', async () => {
    const user = userEvent.setup();
    render(<RiderInput onAnalyze={vi.fn()} isLoading={false} />);
    await user.type(
      screen.getByLabelText('Rider List'),
      'Pogačar, UAE, 700\nVingegaard, Visma, 650',
    );
    expect(screen.getByText('2 valid riders')).toBeInTheDocument();
  });
});
