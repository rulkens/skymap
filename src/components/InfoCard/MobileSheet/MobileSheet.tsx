/**
 * MobileSheet — a draggable bottom-sheet wrapper for the InfoCard on phones,
 * built entirely on CSS scroll-snap rather than a JS drag handler.
 *
 * The gesture (peek ⇄ expanded) is owned by the browser's native scroll-snap:
 * the scroll container has `scroll-snap-type: y mandatory` and exactly two snap
 * children — a transparent `.spacer` (snap position = "peeking", only the top
 * sliver shows) and the `.sheet` itself (snap position = "expanded").  The user
 * flicks between them with momentum and rubber-banding that no hand-rolled
 * pointer-drag could match for free, and it stays interruptible and accessible
 * without a single `touchmove` listener.  This is why there is no JS drag code
 * here at all.
 *
 * Pointer-events are split so the canvas behind the sheet stays usable.  The
 * `.root`, `.spacer`, AND the `.sheet` snap target are all `pointer-events: none`
 * and paint nothing — the `.sheet` exists only to position the expanded snap.
 * The visible glass is an inner `.surface` that hugs the card's content height
 * and is the only element to re-enable `pointer-events: auto`.  So every touch
 * passes through to the WebGPU canvas except one landing directly on the card —
 * including the expanded sheet's area below a short card, which shows canvas
 * rather than an empty background band.  Hugging the surface to its content is
 * what removes that trailing band; the snap target above stays full-height.
 *
 * The only JavaScript is the reset.  When the user selects a different target
 * the card content swaps, and we want the sheet to return to the peek so the new
 * card doesn't appear half-scrolled.  A `useEffect` keyed on the primitive
 * `resetKey` scrolls the container back to top (= the spacer snap = peek).  The
 * key is a plain string, not the target object, which keeps this component
 * card-agnostic and makes the effect dependency trivially correct — no identity
 * pitfalls, no deep compare.
 */

import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import cx from 'classnames';
import styles from './MobileSheet.module.css';

export type MobileSheetProps = {
  /** Identity of the selected target; changing it resets the scroll to the peek snap. */
  resetKey: string;
  children: ReactNode;
};

function MobileSheet({ resetKey, children }: MobileSheetProps): ReactNode {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Return the sheet to the peek snap whenever the selected target changes.
  // `top: 0` is the spacer snap position.  Guard the ref: it is null before the
  // first commit and after unmount.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [resetKey]);

  return (
    <div ref={scrollRef} className={styles.root}>
      <div className={styles.spacer} />
      <section className={cx(styles.sheet, 'mobileSheet')}>
        <div className={styles.surface}>
          <div className={styles.handle} aria-hidden />
          {children}
        </div>
      </section>
    </div>
  );
}

export default MobileSheet;
