// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useIsMobile } from '../../src/hooks/useIsMobile';

// MediaQueryList change listeners captured for manual dispatch in tests.
type ChangeListener = (event: { matches: boolean }) => void;

function makeMediaQueryList(matches: boolean): MediaQueryList & { _listeners: ChangeListener[] } {
  const listeners: ChangeListener[] = [];
  const mql = {
    matches,
    media: '(max-width: 768px)',
    _listeners: listeners,
    addEventListener(type: string, listener: ChangeListener) {
      if (type === 'change') listeners.push(listener);
    },
    removeEventListener(type: string, listener: ChangeListener) {
      if (type === 'change') {
        const idx = listeners.indexOf(listener);
        if (idx !== -1) listeners.splice(idx, 1);
      }
    },
    dispatchEvent() {
      return false;
    },
    onchange: null,
    addListener() {},
    removeListener() {},
  } as unknown as MediaQueryList & { _listeners: ChangeListener[] };
  return mql;
}

describe('useIsMobile', () => {
  let fakeMql: MediaQueryList & { _listeners: ChangeListener[]; matches: boolean };

  beforeEach(() => {
    fakeMql = makeMediaQueryList(false);
    vi.stubGlobal('matchMedia', vi.fn<(query: string) => MediaQueryList>().mockReturnValue(fakeMql));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns true when the query matches', () => {
    fakeMql = makeMediaQueryList(true);
    vi.stubGlobal('matchMedia', vi.fn<(query: string) => MediaQueryList>().mockReturnValue(fakeMql));

    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(true);
  });

  it('returns false when the query does not match', () => {
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);
  });

  it('updates when the media query change event fires', () => {
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);

    act(() => {
      fakeMql._listeners.forEach((fn) => fn({ matches: true }));
    });

    expect(result.current).toBe(true);
  });

  it('returns false when matchMedia is unavailable', () => {
    vi.stubGlobal('matchMedia', undefined);

    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);
  });
});
