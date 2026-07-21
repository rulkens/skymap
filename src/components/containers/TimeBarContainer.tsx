// src/components/containers/TimeBarContainer.tsx
/**
 * TimeBarContainer — store boundary for the sim clock's transport bar.
 *
 * Owns every store reach the presentational `TimeBar` refuses to do itself: it
 * subscribes the time *intent* slice (mode / paused / rateIndex → ladder label /
 * anchor) and maps each control to the matching re-anchoring intent action,
 * mirroring the keyboard shortcuts in `useKeyboardShortcuts`. `memo` localizes an
 * intent change's re-render to this leaf instead of cascading from App.
 *
 * ### The readout ticks locally, not off the engine pub
 *
 * The engine republishes `simDays` through the throttled `engineTimeReported`
 * pub, but that pub only refreshes every few seconds while the clock is
 * live-idle — subscribing it would leave the readout visibly frozen between
 * ticks. So `useTimeReadout` runs its own 1 Hz interval that re-derives the
 * instant from the slice anchor with `deriveSimDays(time, performance.now())`.
 *
 * The time base MUST be `performance.now()`: `anchor.realMs` is itself a
 * `performance.now()` stamp (the intent reducers pin it that way), so a
 * `Date.now()` base here would subtract two unrelated epochs and derive garbage
 * simDays. The derived Julian day crosses back to a `Date` via `julianDaysToUnixMs`
 * only for display through `formatSimClock`.
 */

import { memo, useCallback, useEffect, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import TimeBar from '../TimeBar/TimeBar';
import DateEntryPopover from '../TimeBar/DateEntryPopover/DateEntryPopover';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { selectRateStep, selectTimeState } from '../../state/time/selectors';
import { goLive, pause, resume, setRate } from '../../state/time/timeSlice';
import { enterManualPausedAt } from '../../state/time/enterManualPausedAt';
import { RATE_LADDER } from '../../data/time/rateLadder';
import { deriveSimDays } from '../../utils/time/deriveSimDays';
import { formatSimClock } from '../../utils/time/formatSimClock';
import { julianDaysToUnixMs } from '../../utils/time/julianDaysToUnixMs';
import { unixMsToJulianDays } from '../../utils/time/unixMsToJulianDays';
import type { TimeState } from '../../@types/time/TimeState';

export type TimeBarContainerProps = {
  // App-layout gate, mirroring the sibling HUD pills (paletteOpen || splashVisible).
  readonly hidden: boolean;
};

function clampRateIndex(index: number): number {
  return Math.min(Math.max(index, 0), RATE_LADDER.length - 1);
}

// The current sim instant as a UTC Date — the readout string and the
// date-entry popover's seed both derive from this same moment.
function readoutInstant(time: TimeState): Date {
  return new Date(julianDaysToUnixMs(deriveSimDays(time, performance.now())));
}

function formatReadout(time: TimeState): string {
  return formatSimClock(readoutInstant(time));
}

// The popover is a fixed pane centred just above the bottom-center TimeBar pill.
// Placement lives here rather than in the popover's module (which owns only its
// own chrome), matching the popover css note that the container's wrapper anchors
// it. The offset clears the bar's height; the final corner is a deferred visual
// gate (see TimeBar.tsx), so this stays an estimate, not tuned spacing.
const POPOVER_PLACEMENT: CSSProperties = {
  position: 'fixed',
  left: '50%',
  bottom: 'calc(var(--corner-offset) + 3.5rem)',
  transform: 'translateX(-50%)',
  zIndex: 11,
};

/**
 * Derived readout string that keeps ticking without a per-frame Redux write.
 * Recomputes immediately whenever the intent changes (the `time` reference is
 * new only on an intent dispatch) and once per second in between, so the clock
 * stays visibly alive while the store sits still.
 */
function useTimeReadout(time: TimeState): string {
  const [readout, setReadout] = useState(() => formatReadout(time));

  useEffect(() => {
    const update = () => setReadout(formatReadout(time));
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [time]);

  return readout;
}

function TimeBarContainer({ hidden }: TimeBarContainerProps): ReactNode {
  const dispatch = useAppDispatch();
  const time = useAppSelector(selectTimeState);
  const rateStep = useAppSelector(selectRateStep);
  const readout = useTimeReadout(time);

  const { mode, paused, rateIndex } = time;
  const [popoverOpen, setPopoverOpen] = useState(false);

  const onSlower = useCallback(
    () => dispatch(setRate({ rateIndex: clampRateIndex(rateIndex - 1), nowMs: performance.now() })),
    [dispatch, rateIndex],
  );

  const onFaster = useCallback(
    () => dispatch(setRate({ rateIndex: clampRateIndex(rateIndex + 1), nowMs: performance.now() })),
    [dispatch, rateIndex],
  );

  const onPlayPause = useCallback(
    () =>
      dispatch(paused ? resume({ nowMs: performance.now() }) : pause({ nowMs: performance.now() })),
    [dispatch, paused],
  );

  const onNow = useCallback(
    () => dispatch(goLive({ simDays: unixMsToJulianDays(Date.now()), nowMs: performance.now() })),
    [dispatch],
  );

  // The container owns the popover's open/close and placement; the popover itself
  // is pure. Clicking the readout toggles it.
  const onReadoutClick = useCallback(() => setPopoverOpen((open) => !open), []);
  const onPopoverCancel = useCallback(() => setPopoverOpen(false), []);

  // Commit and the URL `t=` restore share one operation: `enterManualPausedAt`
  // lands the manual clock at the chosen instant, paused (a date jump lands
  // paused, not playing). The shared-`nowMs` invariant lives in that helper.
  const onPopoverCommit = useCallback(
    (instant: Date) => {
      enterManualPausedAt(dispatch, instant);
      setPopoverOpen(false);
    },
    [dispatch],
  );

  return (
    <>
      <TimeBar
        readout={readout}
        rateLabel={rateStep?.label ?? ''}
        mode={mode}
        paused={paused}
        onSlower={onSlower}
        onFaster={onFaster}
        onPlayPause={onPlayPause}
        onNow={onNow}
        onReadoutClick={onReadoutClick}
        hidden={hidden}
      />
      {popoverOpen && !hidden && (
        <div style={POPOVER_PLACEMENT}>
          <DateEntryPopover
            initial={readoutInstant(time)}
            onCommit={onPopoverCommit}
            onCancel={onPopoverCancel}
          />
        </div>
      )}
    </>
  );
}

export default memo(TimeBarContainer);
