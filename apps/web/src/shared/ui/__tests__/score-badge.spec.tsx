import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ScoreBadge } from '../score-badge';

describe('ScoreBadge', () => {
  it('renders score value', () => {
    render(<ScoreBadge score={85.5} maxScore={100} />);
    expect(screen.getByText('85.5')).toBeInTheDocument();
  });

  it('renders "---" for null score', () => {
    render(<ScoreBadge score={null} />);
    expect(screen.getByText('---')).toBeInTheDocument();
  });

  it('applies green color for top 25%', () => {
    const { container } = render(<ScoreBadge score={80} maxScore={100} />);
    expect(container.firstChild).toHaveClass('bg-green-100');
  });

  it('applies yellow color for middle range', () => {
    const { container } = render(<ScoreBadge score={50} maxScore={100} />);
    expect(container.firstChild).toHaveClass('bg-yellow-100');
  });

  it('applies red color for bottom 25%', () => {
    const { container } = render(<ScoreBadge score={10} maxScore={100} />);
    expect(container.firstChild).toHaveClass('bg-red-100');
  });

  it('applies muted style for null', () => {
    const { container } = render(<ScoreBadge score={null} />);
    expect(container.firstChild).toHaveClass('bg-muted');
  });
});
