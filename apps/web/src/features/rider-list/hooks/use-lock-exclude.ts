import { useState, useCallback } from 'react';

export function useLockExclude() {
  const [lockedIds, setLockedIds] = useState<Set<string>>(new Set());
  const [excludedIds, setExcludedIds] = useState<Set<string>>(new Set());

  const toggleLock = useCallback((riderId: string) => {
    setExcludedIds((prev) => {
      if (prev.has(riderId)) {
        const next = new Set(prev);
        next.delete(riderId);
        return next;
      }
      return prev;
    });
    setLockedIds((prev) => {
      const next = new Set(prev);
      if (next.has(riderId)) next.delete(riderId);
      else next.add(riderId);
      return next;
    });
  }, []);

  const toggleExclude = useCallback((riderId: string) => {
    setLockedIds((prev) => {
      if (prev.has(riderId)) {
        const next = new Set(prev);
        next.delete(riderId);
        return next;
      }
      return prev;
    });
    setExcludedIds((prev) => {
      const next = new Set(prev);
      if (next.has(riderId)) next.delete(riderId);
      else next.add(riderId);
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    setLockedIds(new Set());
    setExcludedIds(new Set());
  }, []);

  return { lockedIds, excludedIds, toggleLock, toggleExclude, reset };
}
