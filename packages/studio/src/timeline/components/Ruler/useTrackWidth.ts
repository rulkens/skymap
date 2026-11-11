/** The element's width in px, kept current while it resizes; a fixed fallback until it is measured. */
import { useLayoutEffect, useState, type RefObject } from 'react';

import { FALLBACK_TRACK_PX } from './Ruler.constants';

export function useTrackWidth(ref: RefObject<HTMLElement | null>): number {
  const [width, setWidth] = useState(FALLBACK_TRACK_PX);
  useLayoutEffect(() => {
    const el = ref.current;
    if (el === null || typeof ResizeObserver === 'undefined') return;
    const measure = () => el.clientWidth > 0 && setWidth(el.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return width;
}
