/**
 * MobileSheet — the phone's single bottom sheet: peek ⇄ expanded by pointer drag.
 *
 * Not CSS scroll-snap: iOS Safari cannot scroll a `pointer-events: none` scroller
 * from its `pointer-events: auto` child (WebKit bug 183870), and that pass-through
 * root is what keeps the canvas live above the sheet. So the drag only feeds a
 * `--drag` offset; CSS owns the two rest positions. The selection card (no
 * `panel`) drags from anywhere while peeking, from the handle once expanded (its
 * content scrolls); a panel (Layers) has no peek and rests open. The root sits
 * above the dock via `--bottom-stack-height`, which BottomStack sets.
 */

import { useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import cx from 'classnames';
import Button from '../common/Button/Button';
import styles from './MobileSheet.module.css';

/** Below this travel a touch is a tap, so the card header's buttons still get their click. */
const DRAG_SLOP_PX = 6;
/** Travel past which a release flips the sheet; shorter drags spring back. */
const SNAP_PX = 40;

export type MobileSheetProps = {
  /** Identity of the content; changing it resets the sheet to its resting state. */
  resetKey: string;
  /** Present for panel content: opens expanded and shows a title row with a close button. */
  panel?: { title: string; onClose: () => void };
  children: ReactNode;
};

function MobileSheet({ resetKey, panel, children }: MobileSheetProps): ReactNode {
  const sheetRef = useRef<HTMLElement>(null);
  const handleRef = useRef<HTMLDivElement>(null);
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

  const onPointerDown = (e: ReactPointerEvent<HTMLElement>): void => {
    if (expanded && !handleRef.current?.contains(e.target as Node)) return;
    drag.current = { id: e.pointerId, startY: e.clientY, moved: false };
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLElement>): void => {
    const d = drag.current;
    const sheet = sheetRef.current;
    if (!d || d.id !== e.pointerId || !sheet) return;
    const dy = e.clientY - d.startY;
    if (!d.moved) {
      if (Math.abs(dy) < DRAG_SLOP_PX) return;
      // Capture only once it is a drag: capturing on down would retarget a tap's click to the sheet.
      d.moved = true;
      sheet.setPointerCapture?.(e.pointerId);
      setDragging(true);
    }
    sheet.style.setProperty('--drag', `${dy}px`);
  };

  const onPointerEnd = (e: ReactPointerEvent<HTMLElement>): void => {
    const d = drag.current;
    const sheet = sheetRef.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    if (!d.moved || !sheet) return;
    setDragging(false);
    sheet.style.removeProperty('--drag');
    const dy = e.type === 'pointercancel' ? 0 : e.clientY - d.startY;
    if (dy < -SNAP_PX) setExpanded(true);
    else if (dy > SNAP_PX) {
      setExpanded(false);
      sheet.scrollTo({ top: 0 });
    }
  };

  return (
    <div className={styles.root}>
      <section
        ref={sheetRef}
        className={cx(
          styles.sheet,
          panel ? styles.panel : !expanded && styles.peeking,
          dragging && styles.dragging,
        )}
        {...(!panel && {
          onPointerDown,
          onPointerMove,
          onPointerUp: onPointerEnd,
          onPointerCancel: onPointerEnd,
        })}
      >
        <div ref={handleRef} className={styles.handle} aria-hidden />
        {panel ? (
          <>
            <div className={styles.header}>
              <h2 className={styles.title}>{panel.title}</h2>
              <Button
                className={styles.close}
                onClick={panel.onClose}
                aria-label={`Close ${panel.title}`}
              >
                <span aria-hidden>×</span>
              </Button>
            </div>
            <div className={styles.body}>{children}</div>
          </>
        ) : (
          children
        )}
      </section>
    </div>
  );
}

export default MobileSheet;
