/**
 * MobileSheet — the phone's single bottom sheet: peek ⇄ expanded by drag
 * (`useSheetDrag`). The selection card (no `panel`) drags from anywhere while
 * peeking, from the handle and card header once expanded (its content scrolls);
 * a panel (Layers) has no peek and rests open. The root sits above the dock via
 * `--bottom-stack-height`, which BottomStack sets.
 */

import type { ReactNode } from 'react';
import cx from 'classnames';
import Button from '../common/Button/Button';
import { useSheetDrag } from '../../hooks/useSheetDrag';
import styles from './MobileSheet.module.css';

export type MobileSheetProps = {
  /** Identity of the content; changing it resets the sheet to its resting state. */
  resetKey: string;
  /** Present for panel content: opens expanded and shows a title row with a close button. */
  panel?: { title: string; onClose: () => void };
  children: ReactNode;
};

function MobileSheet({ resetKey, panel, children }: MobileSheetProps): ReactNode {
  const { sheetRef, expanded, dragging, handlers } = useSheetDrag(resetKey);

  return (
    <div className={styles.root}>
      <section
        ref={sheetRef}
        className={cx(
          styles.sheet,
          panel ? styles.panel : !expanded && styles.peeking,
          dragging && styles.dragging,
        )}
        {...(!panel && handlers)}
      >
        <div className={styles.handle} data-sheet-grip aria-hidden />
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
