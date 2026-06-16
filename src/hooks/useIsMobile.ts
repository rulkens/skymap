/**
 * `useIsMobile` — reactive breakpoint hook.
 *
 * Returns `true` when the viewport is at or below the mobile breakpoint
 * (768 px wide).  The breakpoint lives exactly once in this file so
 * consumers import the hook rather than duplicating the magic number.
 *
 * ### Why `matchMedia` instead of a resize observer?
 *
 * `matchMedia` is the platform primitive built for this: it fires exactly
 * when the query boundary is crossed, not on every resize tick.  It also
 * matches the CSS media-query semantics used in the stylesheet, so the JS
 * breakpoint and the CSS breakpoint are guaranteed to be in sync as long as
 * both reference this single constant.
 *
 * ### SSR / pre-hydration safety
 *
 * When `window` or `matchMedia` is absent (SSR, some jest environments),
 * the guard returns `false` so callers default to the desktop layout rather
 * than crashing.  The `useEffect` does not run in those environments, which
 * is the correct no-op behaviour.
 *
 * ### Mount / cleanup shape
 *
 * `useState` is initialised from the live `matches` value so the first render
 * is already correct — no flicker from `false → true`.  `useEffect` then
 * subscribes to `'change'` events; the cleanup removes the same listener
 * reference to avoid stale subscriptions on unmount or Fast Refresh.
 */

import { useEffect, useState } from 'react';

const MOBILE_BREAKPOINT_PX = 768;
const MOBILE_MEDIA_QUERY = `(max-width: ${MOBILE_BREAKPOINT_PX}px)`;

export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState<boolean>(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
    return window.matchMedia(MOBILE_MEDIA_QUERY).matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;

    const mql = window.matchMedia(MOBILE_MEDIA_QUERY);

    const handleChange = (event: MediaQueryListEvent): void => {
      setIsMobile(event.matches);
    };

    mql.addEventListener('change', handleChange);
    return () => mql.removeEventListener('change', handleChange);
  }, []);

  return isMobile;
}
