/**
 * TimeBarContainer — store boundary for the sim clock's transport bar.
 *
 * Owns the store reach `TimeBar` refuses: it subscribes the time *intent* slice
 * and maps each control to its re-anchoring action, mirroring the `[`/`]`/`\`
 * entries in `KEYBOARD_SHORTCUTS`. The readout ticks locally (`useSimInstant`):
 * the engine's throttled pubs carry no sim clock and would freeze it.
 */

import { memo, useCallback, useState } from 'react';
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
import { formatSimClock } from '../../utils/time/formatSimClock';
import { useSimInstant } from '../../hooks/useSimInstant';

export type TimeBarContainerProps = {
  // App-layout gate, mirroring the sibling HUD pills (paletteOpen || splashVisible).
  readonly hidden: boolean;
  // Phone: render the full-width row (see TimeBar).
  readonly row?: boolean;
};

// The date popover is a fixed pane pinned to the bottom-right corner, lifted just
// above the TimeBar toolbar (it may overlap the ScaleBar above it while open;
// the z-index wins). The lift matches the toolbar's height + gap. (The rate
// popover self-places via CSS Anchor Positioning against the rate label instead —
// see RateSelectorPopover.module.css; its fallback mirrors these same values.)
const POPOVER_PLACEMENT: CSSProperties = {
  position: 'fixed',
  right: 'var(--corner-offset)',
  bottom: 'calc(var(--corner-offset) + var(--time-toolbar-height) + var(--space-3))',
  zIndex: 'var(--z-bottom-stack-popover)',
};

// On the phone row the popover spans the screen width, just above the stack.
const ROW_POPOVER_PLACEMENT: CSSProperties = {
  position: 'fixed',
  left: 'var(--corner-offset)',
  right: 'var(--corner-offset)',
  bottom: 'calc(var(--bottom-stack-height) + var(--space-3))',
  zIndex: 'var(--z-bottom-stack-popover)',
};

function TimeBarContainer({ hidden, row }: TimeBarContainerProps): ReactNode {
  const dispatch = useAppDispatch();
  const time = useAppSelector(selectTimeState);
  const rateStep = useAppSelector(selectRateStep);
  const instant = useSimInstant(time);
  const readout = formatSimClock(instant);

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
    (picked: Date) => {
      enterManualPausedAt(dispatch, picked);
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
        row={row}
      />
      {openPopover === 'date' && !hidden && (
        <div style={row ? ROW_POPOVER_PLACEMENT : POPOVER_PLACEMENT}>
          <DateEntryPopover
            initial={new Date(instant)}
            onCommit={onPopoverCommit}
            onCancel={onPopoverClose}
          />
        </div>
      )}
      {/* The rate popover self-places via CSS Anchor Positioning (its .root anchors
          to TimeBar's rate label), so it needs no placement wrapper — rendered
          bare. The date popover above takes a fixed placement wrapper. */}
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
