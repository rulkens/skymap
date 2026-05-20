// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSplash, CURRENT_SPLASH_VERSION, SPLASH_STORAGE_KEY } from '../../src/hooks/useSplash';
import type { UseSplashInput } from '../../src/@types/splash/UseSplashInput';

function makeInput(overrides: Partial<UseSplashInput> = {}): UseSplashInput {
  return {
    status: { kind: 'initializing' },
    loadProgress: null,
    famousMetaReady: false,
    ...overrides,
  };
}

describe('useSplash', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.history.replaceState(null, '', '/');
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts visible on a first-time visit with no deep link', () => {
    const { result } = renderHook(() => useSplash(makeInput()));
    expect(result.current.splashVisible).toBe(true);
    expect(result.current.blocked).toBe(true);
  });

  it('starts hidden on a deep-link arrival (#focus=)', () => {
    window.history.replaceState(null, '', '/#focus=ngc224');
    const { result } = renderHook(() => useSplash(makeInput()));
    expect(result.current.splashVisible).toBe(false);
  });

  it('starts hidden on a deep-link arrival (?tour=)', () => {
    window.history.replaceState(null, '', '/?tour=intro');
    const { result } = renderHook(() => useSplash(makeInput()));
    expect(result.current.splashVisible).toBe(false);
  });

  it('starts hidden when localStorage seenVersion >= current', () => {
    window.localStorage.setItem(SPLASH_STORAGE_KEY, String(CURRENT_SPLASH_VERSION));
    const { result } = renderHook(() => useSplash(makeInput()));
    expect(result.current.splashVisible).toBe(false);
  });

  it('shows splash when seenVersion is lower than current', () => {
    window.localStorage.setItem(SPLASH_STORAGE_KEY, String(CURRENT_SPLASH_VERSION - 1));
    const { result } = renderHook(() => useSplash(makeInput()));
    expect(result.current.splashVisible).toBe(true);
  });

  it('flips blocked=false when status=ready AND famousMetaReady AND loadProgress=null', () => {
    const { result, rerender } = renderHook(({ input }) => useSplash(input), {
      initialProps: { input: makeInput() },
    });
    expect(result.current.blocked).toBe(true);
    rerender({
      input: makeInput({
        status: { kind: 'ready', count: 100, source: 'sdss.bin' },
        loadProgress: null,
        famousMetaReady: true,
      }),
    });
    expect(result.current.blocked).toBe(false);
  });

  it('stays blocked while loadProgress is non-null even after status=ready', () => {
    const { result } = renderHook(() =>
      useSplash(
        makeInput({
          status: { kind: 'ready', count: 100, source: 'sdss.bin' },
          loadProgress: { loadedBytes: 1, totalBytes: 2, inFlightCount: 1 },
          famousMetaReady: true,
        }),
      ),
    );
    expect(result.current.blocked).toBe(true);
  });

  it('dismissExplore writes CURRENT_SPLASH_VERSION to localStorage and hides splash', () => {
    const { result } = renderHook(() => useSplash(makeInput()));
    act(() => result.current.dismissExplore());
    expect(result.current.splashVisible).toBe(false);
    expect(window.localStorage.getItem(SPLASH_STORAGE_KEY)).toBe(String(CURRENT_SPLASH_VERSION));
  });

  it('dismissTour writes seenVersion and hides splash', () => {
    const { result } = renderHook(() => useSplash(makeInput()));
    act(() => result.current.dismissTour());
    expect(result.current.splashVisible).toBe(false);
    expect(window.localStorage.getItem(SPLASH_STORAGE_KEY)).toBe(String(CURRENT_SPLASH_VERSION));
  });

  it('reopen shows splash again WITHOUT touching localStorage', () => {
    window.localStorage.setItem(SPLASH_STORAGE_KEY, String(CURRENT_SPLASH_VERSION));
    const { result } = renderHook(() => useSplash(makeInput()));
    expect(result.current.splashVisible).toBe(false);
    act(() => result.current.reopen());
    expect(result.current.splashVisible).toBe(true);
    expect(window.localStorage.getItem(SPLASH_STORAGE_KEY)).toBe(String(CURRENT_SPLASH_VERSION));
  });

  it('canContinueAnyway flips true after 8 s of being blocked', () => {
    const { result } = renderHook(() => useSplash(makeInput()));
    expect(result.current.canContinueAnyway).toBe(false);
    act(() => {
      vi.advanceTimersByTime(8001);
    });
    expect(result.current.canContinueAnyway).toBe(true);
  });

  it('does not start the 8 s timer when splash is not visible (deep-link path)', () => {
    window.history.replaceState(null, '', '/#focus=ngc224');
    const { result } = renderHook(() => useSplash(makeInput()));
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(result.current.canContinueAnyway).toBe(false);
  });
});
