import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BudgetIndicator } from '../budget-indicator';

describe('BudgetIndicator', () => {
  it('renders spent and total with default unit', () => {
    render(<BudgetIndicator spent={1250} total={2000} />);
    expect(screen.getByText(/1,250H/)).toBeInTheDocument();
    expect(screen.getByText(/2,000H/)).toBeInTheDocument();
  });

  it('renders with custom unit', () => {
    render(<BudgetIndicator spent={500} total={1000} unit="$" />);
    expect(screen.getByText(/500\$/)).toBeInTheDocument();
  });

  it('shows green bar when under 80%', () => {
    const { container } = render(<BudgetIndicator spent={500} total={1000} />);
    const bar = container.querySelector('[style]');
    expect(bar?.className).toContain('bg-green-500');
  });

  it('shows yellow bar at 80-99%', () => {
    const { container } = render(<BudgetIndicator spent={850} total={1000} />);
    const bar = container.querySelector('[style]');
    expect(bar?.className).toContain('bg-yellow-500');
  });

  it('shows red bar when over budget', () => {
    const { container } = render(<BudgetIndicator spent={1100} total={1000} />);
    const bar = container.querySelector('[style]');
    expect(bar?.className).toContain('bg-red-500');
    expect(screen.getByText('Over budget!')).toBeInTheDocument();
  });
});
