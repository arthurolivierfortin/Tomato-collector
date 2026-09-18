// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import { useNow } from './useNow';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('useNow', () => {
  it('runs no timer while stopped, and ticks again once restarted', () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(({ running }) => useNow(undefined, 50, running), { initialProps: { running: false } });
    const stopped = result.current;
    act(() => vi.advanceTimersByTime(1000));
    expect(result.current).toBe(stopped); // aucun rendu tant qu'aucun appel n'est en cours

    rerender({ running: true });
    act(() => vi.advanceTimersByTime(1000));
    expect(result.current).toBeGreaterThan(stopped);
  });

  it('returns the fixed clock as is, without arming anything', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useNow(1234, 50));
    act(() => vi.advanceTimersByTime(1000));
    expect(result.current).toBe(1234);
  });
});
