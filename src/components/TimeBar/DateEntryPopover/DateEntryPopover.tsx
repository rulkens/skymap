// src/components/TimeBar/DateEntryPopover/DateEntryPopover.tsx
/**
 * DateEntryPopover — jump the sim clock to an exact instant.
 *
 * A pure presentational popover: it seeds a single native
 * `<input type="datetime-local">` from the current sim instant, and on commit
 * hands the typed value back as a `Date`. It reaches into no store or clock —
 * the container re-anchors via `setDate` (which drops the clock into manual
 * mode at that instant) and closes the popover.
 *
 * ## UTC, not host time
 *
 * The input is read and written in UTC, matching the readout (`formatSimClock`)
 * and the `t=` URL param. A `datetime-local` input has no timezone of its own —
 * the browser shows the digits verbatim — so we compose/parse the string against
 * the `Date`'s UTC getters rather than its local ones. Interpreting the digits
 * as local time would drift what the user typed from what a shared link carries.
 *
 * ## One native input, no calendar widget
 *
 * A single `datetime-local` field covers date + time with the platform's own
 * picker; the codebase has no date-picker primitive and this doesn't warrant
 * building one. Enter or the Set button commits; Esc or a click outside cancels.
 */

import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import Button from '../../common/Button/Button';
import styles from './DateEntryPopover.module.css';

export type DateEntryPopoverProps = {
  readonly initial: Date; // current sim instant, seeds the input
  readonly onCommit: (instant: Date) => void; // → container dispatches setDate
  readonly onCancel: () => void;
};

function pad2(value: number): string {
  return value.toString().padStart(2, '0');
}

// A `datetime-local` value is 'YYYY-MM-DDTHH:mm'. Build it from the instant's
// UTC fields so the input shows the same wall-clock the UTC readout does.
function toDatetimeLocalUtc(date: Date): string {
  const year = date.getUTCFullYear().toString().padStart(4, '0');
  const month = pad2(date.getUTCMonth() + 1);
  const day = pad2(date.getUTCDate());
  const hours = pad2(date.getUTCHours());
  const minutes = pad2(date.getUTCMinutes());
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

// Inverse of the above: interpret the field digits as UTC. Returns null for an
// empty or malformed value so a blank input never commits an Invalid Date.
function parseDatetimeLocalUtc(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value);
  if (!match) return null;
  const [, year, month, day, hours, minutes] = match;
  return new Date(
    Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hours), Number(minutes)),
  );
}

function DateEntryPopover({ initial, onCommit, onCancel }: DateEntryPopoverProps): ReactNode {
  const [value, setValue] = useState(() => toDatetimeLocalUtc(initial));
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus the input on open so the user can type immediately.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Click-outside dismiss. A document-level mousedown keeps the popover a true
  // popover (the rest of the HUD stays interactive) rather than a modal backdrop.
  useEffect(() => {
    function onDocumentMouseDown(event: MouseEvent) {
      const panel = panelRef.current;
      if (panel && !panel.contains(event.target as Node)) onCancel();
    }
    document.addEventListener('mousedown', onDocumentMouseDown);
    return () => document.removeEventListener('mousedown', onDocumentMouseDown);
  }, [onCancel]);

  function commit(): void {
    const parsed = parseDatetimeLocalUtc(value);
    if (parsed) onCommit(parsed);
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      commit();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      onCancel();
    }
  }

  return (
    <div
      className={styles.root}
      ref={panelRef}
      role="dialog"
      aria-label="Set date and time"
      onKeyDown={onKeyDown}
    >
      <input
        ref={inputRef}
        type="datetime-local"
        className={styles.input}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        aria-label="Date and time (UTC)"
      />
      <Button className={styles.set} variant="primary" onClick={commit}>
        Set
      </Button>
    </div>
  );
}

export default DateEntryPopover;
