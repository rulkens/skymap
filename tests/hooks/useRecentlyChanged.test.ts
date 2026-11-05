// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useRecentlyChanged } from '../../src/hooks/useRecentlyChanged';

describe('useRecentlyChanged', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('is false on mount, true after a change, false once the quiet period passes', () => {
    const { result, rerender } = renderHook(({ k }) => useRecentlyChanged(k, 2000), {
      initialProps: { k: 'a' },
    });
    expect(result.current).toBe(false);

    rerender({ k: 'b' });
    expect(result.current).toBe(true);

    act(() => void vi.advanceTimersByTime(1999));
    expect(result.current).toBe(true);
    act(() => void vi.advanceTimersByTime(1));
    expect(result.current).toBe(false);
  });

  it('restarts the quiet period on every further change', () => {
    const { result, rerender } = renderHook(({ k }) => useRecentlyChanged(k, 2000), {
      initialProps: { k: 1 },
    });
    rerender({ k: 2 });
    act(() => void vi.advanceTimersByTime(1500));
    rerender({ k: 3 });
    act(() => void vi.advanceTimersByTime(1500));
    expect(result.current).toBe(true);
    act(() => void vi.advanceTimersByTime(500));
    expect(result.current).toBe(false);
  });
});
