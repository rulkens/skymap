/**
 * useSheetDrag — peek ⇄ expanded for MobileSheet by pointer drag.
 *
 * Not CSS scroll-snap: iOS Safari cannot scroll a `pointer-events: none` scroller
 * from its `pointer-events: auto` child (WebKit bug 183870), and that pass-through
 * root is what keeps the canvas live above the sheet. So the drag only feeds a
 * `--drag` offset on the sheet; CSS owns the two rest positions. An expanded
 * sheet drags only from `[data-sheet-grip]` elements (the handle, the card
 * header); MobileSheet.module.css gives them `touch-action: none`.
 */

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { SheetDrag } from '../@types/components/SheetDrag';

/** Below this travel a touch is a tap, so the card header's buttons still get their click. */
const DRAG_SLOP_PX = 6;
/** Travel past which a release flips the sheet; shorter drags spring back. */
const SNAP_PX = 40;

/** Changing `resetKey` (new content) returns the sheet to the peek, scrolled to the top. */
export function useSheetDrag(resetKey: string): SheetDrag {
  const sheetRef = useRef<HTMLElement>(null);
  const drag = useRef<{ id: number; startY: number; moved: boolean } | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [shownKey, setShownKey] = useState(resetKey);
  if (shownKey !== resetKey) {
    setShownKey(resetKey);
    setExpanded(false);
  }

  useEffect(() => {
    sheetRef.current?.scrollTo({ top: 0 });
  }, [resetKey]);

  // In the commit that swaps the rest class: cleared sooner, the sheet jumps to its
  // old rest with the transition still off and animates from there (a flicker).
  useLayoutEffect(() => {
    if (!dragging) sheetRef.current?.style.removeProperty('--drag');
  }, [dragging]);

  const onPointerDown = (e: ReactPointerEvent<HTMLElement>): void => {
    if (expanded && !(e.target as Element).closest('[data-sheet-grip]')) return;
    drag.current = { id: e.pointerId, startY: e.clientY, moved: false };
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLElement>): void => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const sheet = e.currentTarget;
    const dy = e.clientY - d.startY;
    if (!d.moved) {
      if (Math.abs(dy) < DRAG_SLOP_PX) return;
      // Capture only once it is a drag: capturing on down would retarget a tap's click to the sheet.
      d.moved = true;
      sheet.setPointerCapture(e.pointerId);
      setDragging(true);
    }
    sheet.style.setProperty('--drag', `${dy}px`);
  };

  const onPointerEnd = (e: ReactPointerEvent<HTMLElement>): void => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    if (!d.moved) return;
    const sheet = e.currentTarget;
    setDragging(false);
    const dy = e.type === 'pointercancel' ? 0 : e.clientY - d.startY;
    if (dy < -SNAP_PX) setExpanded(true);
    else if (dy > SNAP_PX) {
      setExpanded(false);
      sheet.scrollTo({ top: 0 });
    }
  };

  return {
    sheetRef,
    expanded,
    dragging,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: onPointerEnd,
      onPointerCancel: onPointerEnd,
    },
  };
}
