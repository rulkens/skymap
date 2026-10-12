/**
 * MobileSheet — the phone's single bottom sheet, on CSS scroll-snap, no drag handler.
 *
 * The root scrolls with `scroll-snap-type: y mandatory` over a transparent
 * `.spacer` (top = peeking) and the `.sheet` (bottom edge = expanded). The
 * selection card passes no `panel` and swipes between the two; a panel (Layers)
 * has no peek: it rests on the stack under a title row and scrolls inside.
 * Non-modal: touches above the sheet reach the canvas. The root sits above the
 * dock via `--bottom-stack-height`, which BottomStack sets.
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

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [resetKey]);

  return (
    <div ref={scrollRef} className={cx(styles.root, panel && styles.rootPanel)}>
      {!panel && <div className={styles.spacer} />}
      <section className={cx(styles.sheet, panel && styles.panel)}>
        <div className={styles.handle} aria-hidden />
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
