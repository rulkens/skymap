/**
 * useViewCover — claims one cover row for a resting panel: how far `ref`
 * reaches in from `edge`, re-measured on resize, cleared when `active` turns
 * false or the panel unmounts. `active` is "is it showing", never "does it
 * have a rect": faded UI keeps its DOM size.
 */

import { useEffect, type RefObject } from 'react';

import { useAppDispatch } from '../store/hooks';
import { viewCoverCleared, viewCoverSet } from '../state/viewCover/viewCoverSlice';
import type { CoverEdge } from '../@types/layout/CoverEdge';
import type { CoverId } from '../@types/layout/CoverId';

export function useViewCover(
  id: CoverId,
  ref: RefObject<HTMLElement | null>,
  edge: CoverEdge,
  active: boolean,
): void {
  const dispatch = useAppDispatch();

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
      dispatch(viewCoverSet({ id, cover: { edge, reachPx } }));
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
      dispatch(viewCoverCleared(id));
    };
  }, [id, ref, edge, active, dispatch]);
}
