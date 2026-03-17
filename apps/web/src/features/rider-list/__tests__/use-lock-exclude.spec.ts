import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useLockExclude } from '../hooks/use-lock-exclude';

describe('useLockExclude', () => {
  it('starts with empty sets', () => {
    const { result } = renderHook(() => useLockExclude());
    expect(result.current.lockedIds.size).toBe(0);
    expect(result.current.excludedIds.size).toBe(0);
  });

  it('toggleLock adds rider to lockedIds', () => {
    const { result } = renderHook(() => useLockExclude());

    act(() => result.current.toggleLock('Alice'));

    expect(result.current.lockedIds.has('Alice')).toBe(true);
  });

  it('toggleLock removes rider from lockedIds on second call', () => {
    const { result } = renderHook(() => useLockExclude());

    act(() => result.current.toggleLock('Alice'));
    act(() => result.current.toggleLock('Alice'));

    expect(result.current.lockedIds.has('Alice')).toBe(false);
  });

  it('toggleExclude adds rider to excludedIds', () => {
    const { result } = renderHook(() => useLockExclude());

    act(() => result.current.toggleExclude('Bob'));

    expect(result.current.excludedIds.has('Bob')).toBe(true);
  });

  it('toggleExclude removes rider from excludedIds on second call', () => {
    const { result } = renderHook(() => useLockExclude());

    act(() => result.current.toggleExclude('Bob'));
    act(() => result.current.toggleExclude('Bob'));

    expect(result.current.excludedIds.has('Bob')).toBe(false);
  });

  it('toggleLock clears excludedIds for same rider (mutual exclusivity)', () => {
    const { result } = renderHook(() => useLockExclude());

    act(() => result.current.toggleExclude('Alice'));
    expect(result.current.excludedIds.has('Alice')).toBe(true);

    act(() => result.current.toggleLock('Alice'));

    expect(result.current.lockedIds.has('Alice')).toBe(true);
    expect(result.current.excludedIds.has('Alice')).toBe(false);
  });

  it('toggleExclude clears lockedIds for same rider (mutual exclusivity)', () => {
    const { result } = renderHook(() => useLockExclude());

    act(() => result.current.toggleLock('Bob'));
    expect(result.current.lockedIds.has('Bob')).toBe(true);

    act(() => result.current.toggleExclude('Bob'));

    expect(result.current.excludedIds.has('Bob')).toBe(true);
    expect(result.current.lockedIds.has('Bob')).toBe(false);
  });

  it('reset clears both sets', () => {
    const { result } = renderHook(() => useLockExclude());

    act(() => result.current.toggleLock('A'));
    act(() => result.current.toggleExclude('B'));
    act(() => result.current.reset());

    expect(result.current.lockedIds.size).toBe(0);
    expect(result.current.excludedIds.size).toBe(0);
  });
});
