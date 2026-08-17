// @vitest-environment jsdom
/**
 * device.ts — `watchHdrCapability` re-dispatch coverage.
 *
 * This is the one piece of the HDR-capability wiring that can silently rot:
 * a listener that is registered but never wired to a callback looks correct
 * on inspection. A stub `MediaQueryList` stands in for the real
 * `window.matchMedia`, so the test can fire `change` itself and assert the
 * callback actually ran.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { watchHdrCapability } from '../../../src/services/gpu/device';

/** A minimal `MediaQueryList` stub whose `change` listener the test can fire directly. */
function makeStubMql(initialMatches: boolean): {
  mql: MediaQueryList;
  fireChange: (matches: boolean) => void;
} {
  let listener: ((event: MediaQueryListEvent) => void) | null = null;
  const mql = {
    matches: initialMatches,
    addEventListener: vi.fn((_type: string, cb: (event: MediaQueryListEvent) => void) => {
      listener = cb;
    }),
    removeEventListener: vi.fn(),
  } as unknown as MediaQueryList;
  return {
    mql,
    fireChange: (matches: boolean) => {
      listener?.({ matches } as MediaQueryListEvent);
    },
  };
}

describe('watchHdrCapability', () => {
  const originalMatchMedia = window.matchMedia;

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
  });

  it('the media-query listener re-dispatches on change', () => {
    const { mql, fireChange } = makeStubMql(false);
    window.matchMedia = vi.fn(() => mql) as unknown as typeof window.matchMedia;

    const onChange = vi.fn();
    watchHdrCapability(onChange);

    fireChange(true);

    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('the returned cleanup removes the change listener', () => {
    const { mql } = makeStubMql(false);
    window.matchMedia = vi.fn(() => mql) as unknown as typeof window.matchMedia;

    const unsubscribe = watchHdrCapability(vi.fn());
    unsubscribe();

    expect(mql.removeEventListener).toHaveBeenCalledWith('change', expect.any(Function));
  });
});
