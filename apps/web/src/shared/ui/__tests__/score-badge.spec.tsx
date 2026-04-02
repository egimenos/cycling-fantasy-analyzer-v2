import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ScoreBadge } from '../score-badge';

describe('ScoreBadge', () => {
  it('renders score value with one decimal', () => {
    render(<ScoreBadge score={85.5} maxScore={100} />);
    expect(screen.getByText('85.5')).toBeInTheDocument();
  });

  it('formats integer scores to one decimal place', () => {
    render(<ScoreBadge score={80} maxScore={100} />);
    expect(screen.getByText('80.0')).toBeInTheDocument();
  });

  it('renders "---" for null score', () => {
    render(<ScoreBadge score={null} />);
    expect(screen.getByText('---')).toBeInTheDocument();
  });

  it('applies green color classes for top 25% (ratio >= 0.75)', () => {
    const { container } = render(<ScoreBadge score={80} maxScore={100} />);
    const badge = container.firstChild as HTMLElement;
    expect(badge).toHaveClass('bg-green-500/10');
    expect(badge).toHaveClass('border-green-500/30');
    expect(badge).toHaveClass('text-green-600');
  });

  it('applies tertiary color classes for middle range (0.25 <= ratio < 0.75)', () => {
    const { container } = render(<ScoreBadge score={50} maxScore={100} />);
    const badge = container.firstChild as HTMLElement;
    expect(badge).toHaveClass('bg-tertiary/10');
    expect(badge).toHaveClass('border-tertiary/30');
    expect(badge).toHaveClass('text-tertiary');
  });

  it('applies error color classes for bottom 25% (ratio < 0.25)', () => {
    const { container } = render(<ScoreBadge score={10} maxScore={100} />);
    const badge = container.firstChild as HTMLElement;
    expect(badge).toHaveClass('bg-error-container/20');
    expect(badge).toHaveClass('border-error/30');
    expect(badge).toHaveClass('text-error');
  });

  it('applies surface-container-high background for null score', () => {
    const { container } = render(<ScoreBadge score={null} />);
    const badge = container.firstChild as HTMLElement;
    expect(badge).toHaveClass('bg-surface-container-high');
  });

  it('renders a progress bar proportional to the score ratio', () => {
    const { container } = render(<ScoreBadge score={60} maxScore={100} />);
    const badge = container.firstChild as HTMLElement;
    // The inner bar element has an inline width style
    const barTrack = badge.querySelector('.bg-surface-container-highest');
    expect(barTrack).toBeInTheDocument();
    const barFill = barTrack?.firstChild as HTMLElement;
    expect(barFill).toHaveStyle({ width: '60%' });
  });

  it('caps the progress bar at 100%', () => {
    const { container } = render(<ScoreBadge score={120} maxScore={100} />);
    const badge = container.firstChild as HTMLElement;
    const barTrack = badge.querySelector('.bg-surface-container-highest');
    const barFill = barTrack?.firstChild as HTMLElement;
    expect(barFill).toHaveStyle({ width: '100%' });
  });

  it('defaults maxScore to 100', () => {
    const { container } = render(<ScoreBadge score={50} />);
    const badge = container.firstChild as HTMLElement;
    // 50/100 = 0.5, middle range => tertiary colors
    expect(badge).toHaveClass('bg-tertiary/10');
  });
});
