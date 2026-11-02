/**
 * useViewCover — measures how far a resting panel reaches in from `edge` and
 * hands it to `onCover`, re-measured on resize, `null` when `active` turns
 * false or the panel unmounts. `active` is "is it showing", never "does it
 * have a rect": faded UI keeps its DOM size. `onCover` must be stable: a new
 * one clears and re-reports the cover.
 */

import { useEffect, type RefObject } from 'react';

import type { CoverEdge } from '../@types/layout/CoverEdge';
import type { ViewCover } from '../@types/layout/ViewCover';

export function useViewCover(
  ref: RefObject<HTMLElement | null>,
  edge: CoverEdge,
  active: boolean,
  onCover: (cover: ViewCover | null) => void,
): void {
  useEffect(() => {
    const el = ref.current;
    if (!active || !el) return;

    let lastReachPx: number | null = null;
    const measure = () => {
      const rect = el.getBoundingClientRect();
      const reach = {
        top: rect.bottom,
        right: window.innerWidth - rect.left,
        bottom: window.innerHeight - rect.top,
        left: rect.right,
      }[edge];
      const reachPx = Math.round(reach);
      if (reachPx === lastReachPx) return;
      lastReachPx = reachPx;
      onCover({ edge, reachPx });
    };

    measure();
    // A ResizeObserver misses a panel that only moves (a window resize) or
    // settles from an entrance transform, hence the two listeners.
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    window.addEventListener('resize', measure);
    el.addEventListener('animationend', measure);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
      el.removeEventListener('animationend', measure);
      onCover(null);
    };
  }, [ref, edge, active, onCover]);
}
