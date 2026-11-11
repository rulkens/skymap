/**
 * A sideways trackpad swipe that nothing scrolls becomes the browser's back gesture, which would
 * leave the studio. `overscroll-behavior-x` cannot stop it here, since no dock element scrolls
 * sideways, so the dock eats every horizontal wheel; vertical wheels still scroll the rows.
 */
import { useEffect, type RefObject } from 'react';

export function useNoSwipeBack(root: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const dock = root.current;
    if (dock === null) return;
    const onWheel = (event: WheelEvent) => {
      if (event.shiftKey || Math.abs(event.deltaX) > Math.abs(event.deltaY)) event.preventDefault();
    };
    dock.addEventListener('wheel', onWheel, { passive: false });
    return () => dock.removeEventListener('wheel', onWheel);
  }, [root]);
}
