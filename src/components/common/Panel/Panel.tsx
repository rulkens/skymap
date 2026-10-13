/**
 * Panel — the shared glass card with a collapsible header (Navigation, Settings).
 *
 * Collapse state is session-only on purpose: a persisted fold made controls
 * "go missing" weeks later. The body stays mounted and folds with a
 * `grid-template-rows: 0fr → 1fr` transition (the one CollapsibleSection
 * uses); unmounting would make the ~80 settings controls pop in and out.
 * `useId` wires the title button's `aria-controls` to the body.
 */

import { useId, useState, type ReactNode } from 'react';
import cx from 'classnames';
import styles from './Panel.module.css';

export type PanelProps = {
  /** Heading text; the stylesheet uppercases it. */
  title: string;
  /** Forwarded to the outer `<div>` as `aria-label`, for titles that aren't self-describing. */
  ariaLabel?: string;
  /**
   * Placement slot in the title row after the title (SettingsPanel's Tier chip).
   * It sits outside the title `<button>` (no interactive content inside a
   * button); the consumer stops click bubbling so it doesn't toggle the fold.
   */
  headerExtra?: ReactNode;
  children: ReactNode;
};

export function Panel({ title, ariaLabel, headerExtra, children }: PanelProps): ReactNode {
  const [open, setOpen] = useState<boolean>(true);
  const bodyId = `${useId()}-body`;

  return (
    <div className={styles.panel} aria-label={ariaLabel}>
      <div className={styles.titleRow}>
        <button
          type="button"
          className={styles.titleButton}
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls={bodyId}
        >
          <span className={cx(styles.chevron, open && styles.chevronOpen)} aria-hidden>
            ▸
          </span>
          <span className={styles.title}>{title}</span>
        </button>
        {headerExtra !== undefined && <div className={styles.headerExtra}>{headerExtra}</div>}
      </div>

      <div
        id={bodyId}
        className={cx(styles.bodyWrapper, open && styles.bodyWrapperOpen)}
        aria-hidden={!open}
      >
        {/* `.body` only collapses: padding on it would leave a stub at 0fr, so `.bodyContent` pads inside the clip. */}
        <div className={styles.body}>
          <div className={styles.bodyContent}>{children}</div>
        </div>
      </div>
    </div>
  );
}
