import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTeamBuilder } from '../hooks/use-team-builder';
import type { AnalyzedRider } from '@cycling-analyzer/shared-types';

function makeRider(name: string, price = 100, score = 50): AnalyzedRider {
  return {
    rawName: name,
    rawTeam: 'Team',
    priceHillios: price,
    matchedRider: null,
    matchConfidence: 0,
    unmatched: false,
    pointsPerHillio: score / price,
    totalProjectedPts: score,
    categoryScores: {
      gc: 20,
      stage: 10,
      mountain: 10,
      sprint: 5,
      gc_daily: 0,
      mountain_pass: 0,
      sprint_intermediate: 0,
      regularidad_daily: 0,
    },
    breakout: null,
    sameRaceHistory: null,
  };
}

const riders = [
  makeRider('Alice', 100, 50),
  makeRider('Bob', 200, 80),
  makeRider('Charlie', 300, 90),
];

describe('useTeamBuilder', () => {
  it('starts with empty selection', () => {
    const { result } = renderHook(() => useTeamBuilder(2000, riders));
    expect(result.current.selectedRiders).toHaveLength(0);
    expect(result.current.totalCost).toBe(0);
    expect(result.current.totalScore).toBe(0);
    expect(result.current.isTeamComplete).toBe(false);
  });

  it('adds a rider', () => {
    const { result } = renderHook(() => useTeamBuilder(2000, riders));

    act(() => result.current.addRider('Alice'));

    expect(result.current.selectedRiders).toHaveLength(1);
    expect(result.current.selectedRiders[0].rawName).toBe('Alice');
    expect(result.current.totalCost).toBe(100);
    expect(result.current.totalScore).toBe(50);
  });

  it('removes a rider', () => {
    const { result } = renderHook(() => useTeamBuilder(2000, riders));

    act(() => result.current.addRider('Alice'));
    act(() => result.current.removeRider('Alice'));

    expect(result.current.selectedRiders).toHaveLength(0);
    expect(result.current.totalCost).toBe(0);
  });

  it('clears all riders', () => {
    const { result } = renderHook(() => useTeamBuilder(2000, riders));

    act(() => result.current.addRider('Alice'));
    act(() => result.current.addRider('Bob'));
    act(() => result.current.clearAll());

    expect(result.current.selectedRiders).toHaveLength(0);
  });

  it('prevents adding when over budget', () => {
    const { result } = renderHook(() => useTeamBuilder(250, riders));

    act(() => result.current.addRider('Alice')); // 100
    act(() => result.current.addRider('Bob')); // 200 → total 300 > 250

    expect(result.current.selectedRiders).toHaveLength(1);
    expect(result.current.selectedRiders[0].rawName).toBe('Alice');
  });

  it('enforces 9-rider max', () => {
    const manyRiders = Array.from({ length: 12 }, (_, i) => makeRider(`Rider${i}`, 10, 10));
    const { result } = renderHook(() => useTeamBuilder(9999, manyRiders));

    for (let i = 0; i < 12; i++) {
      act(() => result.current.addRider(`Rider${i}`));
    }

    expect(result.current.selectedRiders).toHaveLength(9);
    expect(result.current.isTeamComplete).toBe(true);
  });

  it('prevents adding unmatched riders', () => {
    const unmatchedRiders = [{ ...makeRider('X'), unmatched: true }];
    const { result } = renderHook(() => useTeamBuilder(2000, unmatchedRiders));

    act(() => result.current.addRider('X'));

    expect(result.current.selectedRiders).toHaveLength(0);
  });

  it('isSelected returns correct status', () => {
    const { result } = renderHook(() => useTeamBuilder(2000, riders));

    act(() => result.current.addRider('Alice'));

    expect(result.current.isSelected('Alice')).toBe(true);
    expect(result.current.isSelected('Bob')).toBe(false);
  });

  it('canSelect returns false when budget would be exceeded', () => {
    const { result } = renderHook(() => useTeamBuilder(150, riders));

    act(() => result.current.addRider('Alice')); // 100 used, 50 left

    expect(result.current.canSelect('Bob')).toBe(false); // Bob costs 200
  });

  it('calculates budgetRemaining correctly', () => {
    const { result } = renderHook(() => useTeamBuilder(2000, riders));

    act(() => result.current.addRider('Alice')); // 100
    act(() => result.current.addRider('Bob')); // 200

    expect(result.current.budgetRemaining).toBe(1700);
  });
});
