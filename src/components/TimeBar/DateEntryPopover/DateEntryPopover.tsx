// src/components/TimeBar/DateEntryPopover/DateEntryPopover.tsx
/**
 * DateEntryPopover — jump the sim clock to an exact instant.
 *
 * A pure presentational popover: it seeds a single native
 * `<input type="datetime-local">` from the current sim instant, and on commit
 * hands the typed value back as a `Date`. It reaches into no store or clock —
 * the container re-anchors via `setSimDays` (which drops the clock into manual
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
 *
 * ## Dismissal via useDismissablePopover
 *
 * Esc-to-close and outside-mousedown-to-close are shared with
 * RateSelectorPopover through `useDismissablePopover`, including the
 * trigger-exclusion guard (`[data-date-trigger]`) that stops the readout
 * button's own re-click from closing-then-reopening the popover. Enter-to-commit
 * is specific to this popover, so it's handled locally and composed with the
 * hook's Esc handling in `onKeyDown`.
 */

import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import Button from '../../common/Button/Button';
import { useDismissablePopover } from '../../../hooks/useDismissablePopover';
import styles from './DateEntryPopover.module.css';

export type DateEntryPopoverProps = {
  readonly initial: Date; // current sim instant, seeds the input
  readonly onCommit: (instant: Date) => void; // → container dispatches setSimDays
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
  const inputRef = useRef<HTMLInputElement>(null);
  const { panelRef, onKeyDown: onDismissKeyDown } = useDismissablePopover({
    onClose: onCancel,
    triggerSelector: '[data-date-trigger]',
  });

  // Focus the input on open so the user can type immediately.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  function commit(): void {
    const parsed = parseDatetimeLocalUtc(value);
    if (parsed) onCommit(parsed);
  }

  // Fill the field with the current wall-clock instant, but don't commit. The
  // TimeBar's own "Now" returns the clock to LIVE mode; this is only a fill
  // affordance so the user can jump near now (or tweak from now) without typing
  // today's date. Keeping it fill-only preserves the popover's single commit
  // path (Set / Enter). `new Date()` is the real wall instant, not a sim-clock
  // derivation.
  function fillNow(): void {
    setValue(toDatetimeLocalUtc(new Date()));
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      commit();
      return;
    }
    onDismissKeyDown(event);
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
      <Button
        className={styles.now}
        onClick={fillNow}
        aria-label="Fill with current time"
      >
        Now
      </Button>
      <Button className={styles.set} variant="primary" onClick={commit}>
        Set
      </Button>
    </div>
  );
}

export default DateEntryPopover;
