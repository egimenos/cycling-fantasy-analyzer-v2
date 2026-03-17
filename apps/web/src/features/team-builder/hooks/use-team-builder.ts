import { useState, useMemo, useCallback } from 'react';
import type { AnalyzedRider } from '@cycling-analyzer/shared-types';

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
  const isTeamComplete = selectedNames.size === 9;

  const addRider = useCallback(
    (riderName: string) => {
      if (selectedNames.size >= 9) return;
      const rider = riders.find((r) => r.rawName === riderName);
      if (!rider || rider.unmatched) return;
      const newCost = totalCost + rider.priceHillios;
      if (newCost > budget) return;
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

  const isSelected = useCallback(
    (riderName: string) => selectedNames.has(riderName),
    [selectedNames],
  );

  const canSelect = useCallback(
    (riderName: string) => {
      if (selectedNames.size >= 9) return false;
      const rider = riders.find((r) => r.rawName === riderName);
      if (!rider || rider.unmatched) return false;
      return totalCost + rider.priceHillios <= budget;
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
    isSelected,
    canSelect,
  };
}
