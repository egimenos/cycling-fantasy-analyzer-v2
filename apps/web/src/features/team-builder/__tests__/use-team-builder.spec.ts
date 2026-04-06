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
    seasonBreakdowns: null,
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

  it('prevents adding when over budget (including slot reservation)', () => {
    // Budget 550: Alice (100) + 8 empty slots × 50 = 500 ≤ 550 → allowed
    // Then Bob (200): 300 total + 7 empty slots × 50 = 650 > 550 → blocked
    const { result } = renderHook(() => useTeamBuilder(550, riders));

    act(() => result.current.addRider('Alice')); // 100
    act(() => result.current.addRider('Bob')); // would be 300 + 7×50 = 650 > 550

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
    // Budget 900: Alice (100) + 8×50 = 500 ≤ 900 → can add
    // After Alice: 100 used, 800 left. Bob (200): 300 + 7×50 = 650 ≤ 900 → allowed
    // Charlie (300): 400 + 6×50 = 700 ≤ 900 → allowed
    // But a rider costing 600: 700 + 5×50 = 950 > 900 → blocked
    const expensiveRiders = [...riders, makeRider('Expensive', 600, 100)];
    const { result } = renderHook(() => useTeamBuilder(900, expensiveRiders));

    act(() => result.current.addRider('Alice')); // 100
    act(() => result.current.addRider('Bob')); // 300

    expect(result.current.canSelect('Charlie')).toBe(true); // 600 + 6×50 = 900 ≤ 900
    expect(result.current.canSelect('Expensive')).toBe(false); // 900 + 5×50 = 1150 > 900
  });

  it('canSelect reserves budget for remaining empty slots (MIN_RIDER_PRICE=50)', () => {
    // Budget 700, 5 riders selected (cost 50 each = 250 used, 450 remaining)
    // 4 slots left. Picking a rider leaves 3 slots → need 3×50 = 150 reserved
    // Max affordable = 450 - 150 = 300
    const manyRiders = [
      ...Array.from({ length: 5 }, (_, i) => makeRider(`Sel${i}`, 50, 10)),
      makeRider('Affordable', 300, 80),
      makeRider('TooExpensive', 301, 90),
    ];
    const { result } = renderHook(() => useTeamBuilder(700, manyRiders));

    for (let i = 0; i < 5; i++) {
      act(() => result.current.addRider(`Sel${i}`));
    }

    expect(result.current.canSelect('Affordable')).toBe(true);
    expect(result.current.canSelect('TooExpensive')).toBe(false);
  });

  it('addRider blocks picks that would starve remaining slots', () => {
    // Budget 500, 0 selected, 9 slots. Picking leaves 8 → reserve 8×50 = 400
    // Max affordable = 500 - 400 = 100
    const testRiders = [makeRider('Cheap', 100, 50), makeRider('Expensive', 101, 80)];
    const { result } = renderHook(() => useTeamBuilder(500, testRiders));

    act(() => result.current.addRider('Expensive')); // 101 + 8×50 = 501 > 500
    expect(result.current.selectedRiders).toHaveLength(0);

    act(() => result.current.addRider('Cheap')); // 100 + 8×50 = 500 ≤ 500
    expect(result.current.selectedRiders).toHaveLength(1);
  });

  it('calculates budgetRemaining correctly', () => {
    const { result } = renderHook(() => useTeamBuilder(2000, riders));

    act(() => result.current.addRider('Alice')); // 100
    act(() => result.current.addRider('Bob')); // 200

    expect(result.current.budgetRemaining).toBe(1700);
  });
});
