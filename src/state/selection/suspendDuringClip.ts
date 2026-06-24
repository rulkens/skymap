/**
 * suspendDuringClip — a HOF that gates a `takeEvery` worker on the absence of
 * an active animation clip.
 *
 * WHY the guard lives INSIDE the worker, not around the watcher:
 *
 *   A `takeEvery` registers its listener ONCE at boot. If you wrapped the watcher
 *   with a clip check — `if (selectClipActive(...)) return` around the `takeEvery`
 *   call — you'd evaluate the guard a single time during the root saga's startup
 *   and either never register the listener (clip already active at boot, unlikely
 *   but possible) or always register it (the common case), in which case the check
 *   does nothing useful.
 *
 *   Re-checking INSIDE the worker function means the guard runs on EVERY dispatched
 *   action, exactly when a clip might have become active between the last action and
 *   this one. That's the per-dispatch granularity the spec requires.
 *
 * WHAT it protects:
 *
 *   While a clip owns the camera at driver-priority 95, `watchFocusTween` must not
 *   plant a `camera.tween`. A tween planted during a clip is dormant only while the
 *   clip@95 driver wins priority — the instant `endClip` fires and the clip driver
 *   yields, the leftover tween@60 outranks `resting`@0 and snaps the camera to a
 *   stale focus target. Task 4's `endClip` reducer clears tweens planted BEFORE the
 *   clip started; this guard stops NEW ones from being planted DURING it.
 *
 * SCOPE — guard only `watchFocusTween`. The clip RELIES on:
 *   - `watchFades` driving `intentOpacity` for in-clip fade cues.
 *   - `watchSelectionRows` reconciling `selectionRows.focus` for the isolation dim
 *     that in-clip `focus()` cues trigger.
 * Parking either of those would make in-clip focus/fade cues silently no-op.
 */
import { select } from 'typed-redux-saga';

import { selectClipActive } from '../camera/selectors';

export function suspendDuringClip<A>(worker: (action: A) => Generator) {
  return function* (action: A) {
    // Re-read clip state on every dispatch — the guard is not a one-time check.
    if (selectClipActive(yield* select())) return;
    yield* worker(action);
  };
}
