/**
 * timeSlice — the sim clock's *intent* as an RTK slice: the user's decisions
 * about how time flows (rate, direction, pause, live-vs-manual, scrub target),
 * and nothing else. There is no wall-clock tick in here; the current sim instant
 * is *derived* on demand by `deriveSimDays(time, nowMs)`, never stored.
 *
 * ### Re-anchor discipline is the contract
 *
 * `TimeState` is anchor-not-accumulate (see the type's docblock): sim time
 * integrates from an `(simDays, realMs)` anchor at the current rate. For playback
 * to stay *continuous* across an intent change — a rate step, a direction flip, a
 * pause or resume — every such action must re-anchor to the sim instant it fired
 * at BEFORE applying its change. Concretely: capture `deriveSimDays(time, nowMs)`
 * as the new `anchor.simDays` with `anchor.realMs = nowMs`, then mutate. Because
 * the fresh anchor's `realMs` equals the action's `nowMs`, a derivation at that
 * same `nowMs` yields exactly `anchor.simDays` — the value it read a moment
 * earlier — so the clock never jumps. A reducer that forgets to re-anchor makes
 * time leap; that continuity is the single most important invariant here.
 *
 * `reanchor` is the shared helper the four continuity-preserving reducers call.
 * `setSimDays` / `goLive` do NOT re-anchor from the derived value — they overwrite
 * the anchor with an *externally-supplied* `simDays` (a scrub target, or the
 * wall-clock JD the caller captured), which is itself the re-anchor for a scrub.
 *
 * Every payload carries `nowMs`; the caller passes `performance.now()` so the
 * slice stays a pure function of intent and never reads a clock itself.
 *
 * ### Initial state
 *
 * Live mode, anchored at the J2000 epoch (`simDays = 2451545.0`, `realMs = 0`) as
 * a static seed. The engine dispatches one `goLive` with the real wall-clock JD at
 * bootstrap (Task 8) so "the map is always true on load" — the J2000 seed only has
 * to be a valid, deterministic starting anchor, not the truth.
 */

import { createSlice, type PayloadAction, type Draft } from '@reduxjs/toolkit';

import { timeRoute } from '../../store/constants';
import type { TimeState } from '../../@types/time/TimeState';
import { deriveSimDays } from '../../utils/time/deriveSimDays';
import { CONST_J2000 } from '../../data/time/constJ2000';

const initialState: TimeState = {
  mode: 'live',
  // J2000.0 as a Julian Day number — the static seed anchor. Overwritten by the
  // engine's bootstrap `goLive` before the first frame the user sees.
  anchor: { simDays: CONST_J2000, realMs: 0 },
  // '1 s/s' — the boot clock is live, which advances at exactly wall time, so the
  // ladder detent must read the same rate the user is actually shown. Any other
  // default would make the toolbar label lie until the first manual step.
  rateIndex: 0,
  direction: 1,
  paused: false,
};

/**
 * Re-anchor to the current derived sim instant. Reads `deriveSimDays` on the
 * pre-change draft, then pins that value as the new anchor at `realMs = nowMs`.
 * MUST be called before the reducer mutates rate / direction / paused, so the
 * derivation it captures reflects the state as it was up to this instant.
 */
function reanchor(time: Draft<TimeState>, nowMs: number): void {
  time.anchor = { simDays: deriveSimDays(time, nowMs), realMs: nowMs };
}

const timeSlice = createSlice({
  name: timeRoute,
  initialState,
  reducers: {
    // Manual playback at a chosen ladder detent. Re-anchor first so the speed
    // change is continuous, then switch to manual mode and set the index.
    setRate: (time, action: PayloadAction<{ rateIndex: number; nowMs: number }>) => {
      reanchor(time, action.payload.nowMs);
      time.mode = 'manual';
      time.rateIndex = action.payload.rateIndex;
    },

    // Flip playback direction. Re-anchor first so the flip pivots about the
    // current instant rather than jumping.
    setDirection: (time, action: PayloadAction<{ direction: 1 | -1; nowMs: number }>) => {
      reanchor(time, action.payload.nowMs);
      time.mode = 'manual';
      time.direction = action.payload.direction;
    },

    // Freeze at the current instant. Re-anchor captures it; `paused` then makes
    // the derivation ignore `nowMs`, holding `anchor.simDays` verbatim.
    pause: (time, action: PayloadAction<{ nowMs: number }>) => {
      reanchor(time, action.payload.nowMs);
      time.paused = true;
    },

    // Resume from the paused instant. Re-anchor rebases `realMs` to now so
    // playback continues from where it froze; mode is left unchanged.
    resume: (time, action: PayloadAction<{ nowMs: number }>) => {
      reanchor(time, action.payload.nowMs);
      time.paused = false;
    },

    // Scrub to an externally-chosen instant in manual mode. Overwrites the anchor
    // with the supplied `simDays` (this IS the re-anchor for a scrub).
    setSimDays: (time, action: PayloadAction<{ simDays: number; nowMs: number }>) => {
      time.mode = 'manual';
      time.anchor = { simDays: action.payload.simDays, realMs: action.payload.nowMs };
    },

    // Snap to the live wall-clock JD the caller captured and track real time
    // forward from it. Clears pause and forces forward direction.
    goLive: (time, action: PayloadAction<{ simDays: number; nowMs: number }>) => {
      time.mode = 'live';
      time.anchor = { simDays: action.payload.simDays, realMs: action.payload.nowMs };
      time.paused = false;
      time.direction = 1;
      // Live pins to wall time (1 s/s), so the ladder detent must land on the
      // truthful rate the user is shown — otherwise the toolbar would read a
      // stale manual detent live mode ignores. A subsequent Faster then walks up
      // from the real rate rather than jumping from wherever manual left off.
      time.rateIndex = 0;
    },
  },
});

export const { setRate, setDirection, pause, resume, setSimDays, goLive } = timeSlice.actions;

export default timeSlice.reducer;
