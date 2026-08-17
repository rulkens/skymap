// src/components/containers/TimeBarContainer.tsx
/**
 * TimeBarContainer — store boundary for the sim clock's transport bar.
 *
 * Owns every store reach the presentational `TimeBar` refuses to do itself: it
 * subscribes the time *intent* slice (mode / paused / rateIndex → ladder label /
 * anchor) and maps each control to the matching re-anchoring intent action,
 * mirroring the `[`/`]`/`\` entries in `KEYBOARD_SHORTCUTS`. `memo` localizes
 * an intent change's re-render to this leaf instead of cascading from App.
 *
 * ### The readout ticks locally, not off an engine pub
 *
 * The engine's throttled `engineBodyDistanceReported` pub only carries the
 * focused-body distance, not the sim clock, and only refreshes every few
 * seconds while the clock is live-idle — subscribing it would leave the
 * readout visibly frozen between ticks. So `useTimeReadout` runs its own 1 Hz
 * interval that re-derives the instant from the slice anchor with
 * `deriveSimDays(time, performance.now())`.
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
import RateSelectorPopover from '../TimeBar/RateSelectorPopover/RateSelectorPopover';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { selectRateStep, selectTimeState } from '../../state/time/selectors';
import { pause, resume, setRate } from '../../state/time/timeSlice';
import { enterManualPausedAt } from '../../state/time/enterManualPausedAt';
import { goLiveNowAction } from '../../state/time/goLiveNowAction';
import { RATE_LADDER } from '../../data/time/rateLadder';
import { deriveSimDays } from '../../utils/time/deriveSimDays';
import { formatSimClock } from '../../utils/time/formatSimClock';
import { julianDaysToUnixMs } from '../../utils/time/julianDaysToUnixMs';
import type { TimeState } from '../../@types/time/TimeState';

export type TimeBarContainerProps = {
  // App-layout gate, mirroring the sibling HUD pills (paletteOpen || splashVisible).
  readonly hidden: boolean;
};

// The current sim instant as a UTC Date — the readout string and the
// date-entry popover's seed both derive from this same moment.
function readoutInstant(time: TimeState): Date {
  return new Date(julianDaysToUnixMs(deriveSimDays(time, performance.now())));
}

function formatReadout(time: TimeState): string {
  return formatSimClock(readoutInstant(time));
}

// The date popover is a fixed pane pinned to the bottom-right corner, lifted just
// above the TimeBar toolbar (it may overlap the ScaleBar above it while open;
// the z-index wins). The lift matches the toolbar's height + gap. (The rate
// popover self-places via CSS Anchor Positioning against the rate label instead —
// see RateSelectorPopover.module.css; its fallback mirrors these same values.)
const POPOVER_PLACEMENT: CSSProperties = {
  position: 'fixed',
  right: 'var(--corner-offset)',
  bottom: 'calc(var(--corner-offset) + var(--time-toolbar-height) + var(--space-3))',
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

  // One discriminated open-state, not two parallel booleans: the popovers are
  // mutually exclusive (opening one closes the other), so a single value both
  // models that invariant and makes "which, if any, is open" a single read.
  const [openPopover, setOpenPopover] = useState<'none' | 'date' | 'rate'>('none');

  // At the ladder ends the step is inert: a clamped step used to re-dispatch the
  // same rate, which silently re-anchors a live clock into manual mode (the only
  // tell being the Now button appearing). Skip the dispatch entirely at the ends
  // and disable the button so it can't fire — no clamp needed.
  const atSlowest = rateIndex === 0;
  const atFastest = rateIndex === RATE_LADDER.length - 1;

  const onSlower = useCallback(() => {
    if (rateIndex === 0) return;
    dispatch(setRate({ rateIndex: rateIndex - 1, nowMs: performance.now() }));
  }, [dispatch, rateIndex]);

  const onFaster = useCallback(() => {
    if (rateIndex === RATE_LADDER.length - 1) return;
    dispatch(setRate({ rateIndex: rateIndex + 1, nowMs: performance.now() }));
  }, [dispatch, rateIndex]);

  const onPlayPause = useCallback(
    () =>
      dispatch(paused ? resume({ nowMs: performance.now() }) : pause({ nowMs: performance.now() })),
    [dispatch, paused],
  );

  const onNow = useCallback(() => dispatch(goLiveNowAction()), [dispatch]);

  // The container owns each popover's open/close and placement; the popovers
  // themselves are pure. Each trigger toggles its own popover, which (via the
  // single open-state) closes the other one.
  const onReadoutClick = useCallback(
    () => setOpenPopover((cur) => (cur === 'date' ? 'none' : 'date')),
    [],
  );
  const onRateLabelClick = useCallback(
    () => setOpenPopover((cur) => (cur === 'rate' ? 'none' : 'rate')),
    [],
  );
  const onPopoverClose = useCallback(() => setOpenPopover('none'), []);

  // Selecting a detent jumps straight to it — same setRate payload the
  // Slower/Faster steppers build (performance.now() base, matching anchor.realMs)
  // — then closes the selector.
  const onRateSelect = useCallback(
    (nextRateIndex: number) => {
      dispatch(setRate({ rateIndex: nextRateIndex, nowMs: performance.now() }));
      setOpenPopover('none');
    },
    [dispatch],
  );

  // Commit and the URL `t=` restore share one operation: `enterManualPausedAt`
  // lands the manual clock at the chosen instant, paused (a date jump lands
  // paused, not playing). The shared-`nowMs` invariant lives in that helper.
  const onPopoverCommit = useCallback(
    (instant: Date) => {
      enterManualPausedAt(dispatch, instant);
      setOpenPopover('none');
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
        slowerDisabled={atSlowest}
        fasterDisabled={atFastest}
        onPlayPause={onPlayPause}
        onNow={onNow}
        onReadoutClick={onReadoutClick}
        onRateLabelClick={onRateLabelClick}
        hidden={hidden}
        // Either popover is anchored to (or triggered from) a button inside the
        // collapsing controls strip; hold it expanded for the duration so the
        // rate popover's CSS anchor doesn't move out from under an open click.
        holdControlsOpen={openPopover !== 'none'}
      />
      {openPopover === 'date' && !hidden && (
        <div style={POPOVER_PLACEMENT}>
          <DateEntryPopover
            initial={readoutInstant(time)}
            onCommit={onPopoverCommit}
            onCancel={onPopoverClose}
          />
        </div>
      )}
      {/* The rate popover self-places via CSS Anchor Positioning (its .root anchors
          to TimeBar's rate label), so it needs no placement wrapper — rendered
          bare. The date popover above keeps the fixed right-rail wrapper. */}
      {openPopover === 'rate' && !hidden && (
        <RateSelectorPopover
          currentIndex={rateIndex}
          onSelect={onRateSelect}
          onClose={onPopoverClose}
        />
      )}
    </>
  );
}

export default memo(TimeBarContainer);
