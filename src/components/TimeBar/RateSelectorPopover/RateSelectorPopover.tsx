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
 * ## Dismissal mirrors DateEntryPopover
 *
 * Esc and a document-level mousedown outside the panel close it — the same
 * mechanism its sibling popover implements, kept as a mirrored copy rather than
 * a second invented one so the family behaves identically.
 */

import { useEffect, useRef, type KeyboardEvent, type ReactNode } from 'react';
import cx from 'classnames';
import { RATE_LADDER } from '../../../data/time/rateLadder';
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
  const panelRef = useRef<HTMLDivElement>(null);

  // Click-outside dismiss. A document-level mousedown keeps this a true popover
  // (the rest of the HUD stays interactive) rather than a modal backdrop.
  useEffect(() => {
    function onDocumentMouseDown(event: MouseEvent) {
      const panel = panelRef.current;
      if (panel && !panel.contains(event.target as Node)) onClose();
    }
    document.addEventListener('mousedown', onDocumentMouseDown);
    return () => document.removeEventListener('mousedown', onDocumentMouseDown);
  }, [onClose]);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
    }
  }

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
