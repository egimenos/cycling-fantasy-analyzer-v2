import { useState, useMemo, useCallback } from 'react';
import type { AnalyzedRider } from '@cycling-analyzer/shared-types';

const MAX_RIDERS = 9;
const MIN_RIDER_PRICE = 50;

export function useTeamBuilder(budget: number, riders: AnalyzedRider[]) {
  const [selectedNames, setSelectedNames] = useState<Set<string>>(new Set());

  const selectedRiders = useMemo(
    () => riders.filter((r) => selectedNames.has(r.rawName)),
    [riders, selectedNames],
  );

  const totalCost = useMemo(
    () => selectedRiders.reduce((sum, r) => sum + r.priceHillios, 0),
    [selectedRiders],
  );

  const totalScore = useMemo(
    () => selectedRiders.reduce((sum, r) => sum + (r.totalProjectedPts ?? 0), 0),
    [selectedRiders],
  );

  const budgetRemaining = budget - totalCost;
  const isTeamComplete = selectedNames.size === MAX_RIDERS;

  const addRider = useCallback(
    (riderName: string) => {
      if (selectedNames.size >= MAX_RIDERS) return;
      const rider = riders.find((r) => r.rawName === riderName);
      if (!rider || rider.unmatched) return;
      const newCost = totalCost + rider.priceHillios;
      const slotsAfterPick = MAX_RIDERS - selectedNames.size - 1;
      if (newCost + slotsAfterPick * MIN_RIDER_PRICE > budget) return;
      setSelectedNames((prev) => new Set([...prev, riderName]));
    },
    [selectedNames.size, riders, totalCost, budget],
  );

  const removeRider = useCallback((riderName: string) => {
    setSelectedNames((prev) => {
      const next = new Set(prev);
      next.delete(riderName);
      return next;
    });
  }, []);

  const clearAll = useCallback(() => setSelectedNames(new Set()), []);

  /** Replace the entire selection at once (e.g. from optimizer results). */
  const setTeam = useCallback((riderNames: string[]) => {
    setSelectedNames(new Set(riderNames.slice(0, MAX_RIDERS)));
  }, []);

  const isSelected = useCallback(
    (riderName: string) => selectedNames.has(riderName),
    [selectedNames],
  );

  const canSelect = useCallback(
    (riderName: string) => {
      if (selectedNames.size >= MAX_RIDERS) return false;
      const rider = riders.find((r) => r.rawName === riderName);
      if (!rider || rider.unmatched) return false;
      const slotsAfterPick = MAX_RIDERS - selectedNames.size - 1;
      return totalCost + rider.priceHillios + slotsAfterPick * MIN_RIDER_PRICE <= budget;
    },
    [selectedNames.size, riders, totalCost, budget],
  );

  return {
    selectedRiders,
    selectedNames,
    totalCost,
    totalScore,
    budgetRemaining,
    isTeamComplete,
    addRider,
    removeRider,
    clearAll,
    setTeam,
    isSelected,
    canSelect,
  };
}
