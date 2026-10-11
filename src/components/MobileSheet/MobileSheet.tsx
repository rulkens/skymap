/**
 * MobileSheet — the phone's single bottom sheet, built on CSS scroll-snap
 * rather than a JS drag handler.
 *
 * The root is a scroll container with `scroll-snap-type: y mandatory` and two
 * snap children: a transparent `.spacer` (scrolled to top = "peeking") and the
 * `.sheet` (snapped by its bottom edge = "expanded"). The browser supplies the
 * flick, momentum and rubber-banding, so there is no touch listener here.
 *
 * Content decides the behaviour. The selection card passes no `panel`: it rests
 * at the peek and swipes up. A panel (Places, Layers) passes `panel`: no peek
 * snap, the sheet sits expanded on the stack under a fixed title row with a
 * close button, capped so a strip of canvas stays visible, and its body scrolls
 * inside. The sheet is non-modal: `.root` and `.spacer` ignore pointer events
 * so touches above the sheet reach the canvas.
 *
 * The root sits above the dock and time row via `--bottom-stack-height`, which
 * BottomStack sets; the sheet itself owns the glass surface (blur included).
 */

import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import cx from 'classnames';
import Button from '../common/Button/Button';
import styles from './MobileSheet.module.css';

export type MobileSheetProps = {
  /** Identity of the content; changing it resets the sheet to its resting state. */
  resetKey: string;
  /** Present for panel content: opens expanded and shows a title row with a close button. */
  panel?: { title: string; onClose: () => void };
  children: ReactNode;
};

function MobileSheet({ resetKey, panel, children }: MobileSheetProps): ReactNode {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Return to the peek snap (top = spacer) when the content changes. The ref is
  // null before the first commit and after unmount.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [resetKey]);

  return (
    <div ref={scrollRef} className={cx(styles.root, panel && styles.rootPanel)}>
      <div className={styles.spacer} />
      <section className={cx(styles.sheet, panel && styles.panel, 'mobileSheet')}>
        <div className={styles.handle} aria-hidden />
        {panel && (
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
        )}
        {children}
      </section>
    </div>
  );
}

export default MobileSheet;
