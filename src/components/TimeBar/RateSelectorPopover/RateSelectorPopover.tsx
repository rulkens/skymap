// src/components/TimeBar/RateSelectorPopover/RateSelectorPopover.tsx
/**
 * RateSelectorPopover — pick any playback detent directly.
 *
 * A pure presentational popover: a vertical list of every RATE_LADDER detent,
 * the current one highlighted. Clicking a row hands its ladder index back; the
 * container dispatches setRate and closes. It reaches into no store or clock —
 * RATE_LADDER is static data, so the component reads it directly rather than
 * threading fifteen labels through props.
 *
 * ## Fastest at top, slowest at bottom
 *
 * RATE_LADDER is authored ascending (slowest first). The list renders it
 * reversed so the fastest detent sits at the top and the slowest at the bottom,
 * making the column read like a vertical slider where up = faster. That matches
 * the toolbar's ‹ › stepper, where right steps toward a faster rate.
 *
 * ## Dismissal via useDismissablePopover
 *
 * Esc and a document-level mousedown outside the panel close it, including
 * the trigger-exclusion guard (`[data-rate-trigger]`) that stops the rate
 * label's own re-click from closing-then-reopening the popover. Shared with
 * DateEntryPopover via `useDismissablePopover` so the family behaves
 * identically instead of maintaining two mirrored copies.
 */

import type { ReactNode } from 'react';
import cx from 'classnames';
import { RATE_LADDER } from '../../../data/time/rateLadder';
import { useDismissablePopover } from '../../../hooks/useDismissablePopover';
import styles from './RateSelectorPopover.module.css';

export type RateSelectorPopoverProps = {
  readonly currentIndex: number; // the lit detent — RATE_LADDER index
  readonly onSelect: (rateIndex: number) => void; // → container dispatches setRate
  readonly onClose: () => void;
};

function RateSelectorPopover({
  currentIndex,
  onSelect,
  onClose,
}: RateSelectorPopoverProps): ReactNode {
  const { panelRef, onKeyDown } = useDismissablePopover({
    onClose,
    triggerSelector: '[data-rate-trigger]',
  });

  // Reversed view of the ascending ladder — fastest row first — while each row
  // keeps its true RATE_LADDER index so onSelect reports the real detent.
  const rows = RATE_LADDER.map((step, index) => ({ step, index })).reverse();

  return (
    <div
      className={styles.root}
      ref={panelRef}
      role="dialog"
      aria-label="Playback speed"
      onKeyDown={onKeyDown}
    >
      {rows.map(({ step, index }) => (
        <button
          key={step.label}
          type="button"
          className={cx(styles.detent, index === currentIndex && styles.detentCurrent)}
          aria-current={index === currentIndex || undefined}
          onClick={() => onSelect(index)}
        >
          {step.label}
        </button>
      ))}
    </div>
  );
}

export default RateSelectorPopover;
