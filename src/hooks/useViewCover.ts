/**
 * useViewCover — measures how far a resting panel reaches in from `edge`, and
 * its span along that edge, and hands both to `onCover`, re-measured on
 * resize, `null` when `active` turns false or the panel unmounts. `active` is "is it showing", never "does it
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

    let last: ViewCover | null = null;
    const measure = () => {
      // Judged in the resting layout: inside a scrolled column (the phone
      // exhibit) the rect moves with the scroll, so a re-measure would jump.
      let scrollX = 0;
      let scrollY = 0;
      for (let p = el.parentElement; p; p = p.parentElement) {
        scrollX += p.scrollLeft;
        scrollY += p.scrollTop;
      }
      const rect = el.getBoundingClientRect();
      const reach = {
        top: rect.bottom + scrollY,
        right: window.innerWidth - rect.left - scrollX,
        bottom: window.innerHeight - rect.top - scrollY,
        left: rect.right + scrollX,
      }[edge];
      const alongY = edge === 'left' || edge === 'right';
      const spanPx: [number, number] = alongY
        ? [Math.round(rect.top + scrollY), Math.round(rect.bottom + scrollY)]
        : [Math.round(rect.left + scrollX), Math.round(rect.right + scrollX)];
      const reachPx = Math.round(reach);
      if (
        last?.reachPx === reachPx &&
        last.spanPx[0] === spanPx[0] &&
        last.spanPx[1] === spanPx[1]
      ) {
        return;
      }
      last = { edge, reachPx, spanPx };
      onCover(last);
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
