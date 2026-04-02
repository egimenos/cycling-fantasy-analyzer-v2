import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BudgetIndicator } from '../budget-indicator';

describe('BudgetIndicator', () => {
  it('renders spent and total with no unit by default', () => {
    render(<BudgetIndicator spent={1250} total={2000} />);
    expect(screen.getByText(/1,250/)).toBeInTheDocument();
    expect(screen.getByText(/2,000/)).toBeInTheDocument();
  });

  it('renders with custom unit', () => {
    render(<BudgetIndicator spent={500} total={1000} unit="$" />);
    expect(screen.getByText(/500\$/)).toBeInTheDocument();
  });

  it('shows gradient bar when under budget', () => {
    const { container } = render(<BudgetIndicator spent={500} total={1000} />);
    const bar = container.querySelector('[style]');
    expect(bar?.className).toContain('bg-gradient-to-r');
    expect(bar?.className).toContain('from-secondary');
    expect(bar?.className).toContain('to-blue-400');
  });

  it('uses same gradient bar at 80-99%', () => {
    const { container } = render(<BudgetIndicator spent={850} total={1000} />);
    const bar = container.querySelector('[style]');
    expect(bar?.className).toContain('bg-gradient-to-r');
    expect(bar?.className).not.toContain('bg-error');
  });

  it('shows error bar and warning when over budget', () => {
    const { container } = render(<BudgetIndicator spent={1100} total={1000} />);
    const bar = container.querySelector('[style]');
    expect(bar?.className).toContain('bg-error');
    expect(bar?.className).toContain('animate-pulse');
    expect(screen.getByText('Over budget!')).toBeInTheDocument();
  });
});
