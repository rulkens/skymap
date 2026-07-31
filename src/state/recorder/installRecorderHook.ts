/**
 * installRecorderHook — expose `window.__skymapRecorder` (the recorder
 * harness's single seam) when the page runs in cinema mode.
 *
 * The `?cinema` gate lives INSIDE the installer, not at the call site:
 * main.tsx calls it unconditionally (one line, no branch to forget) and the
 * gate itself stays unit-testable by mocking `isCinemaMode`. Outside cinema
 * mode this is a pure no-op — nothing is attached to `window`, no store
 * subscription is created.
 *
 * ### `ready` — a debounced predicate, not a first-true resolve
 *
 * "Capture-ready" is the debounced stability window shared with the perf
 * harness: `ready` is `whenStablyReady(store)` from `../lifecycle/whenStablyReady`,
 * whose module header explains why a first-true resolve would fire mid-bootstrap
 * (the load-progress aggregate is null before the first slot starts) and why the
 * predicate must instead HOLD for `READY_STABLE_MS`.
 *
 * ### `startTour` — dispatch the existing action, observe the slice
 *
 * No recorder-specific action exists: the hook dispatches the same
 * `startTour` creator the UI uses and resolves on the `tour.active`
 * true → false transition, which `guidedTourSaga`'s finally guarantees on
 * both natural completion and exit. Watching the slice (rather than adding a
 * "tourFinished" callback seam) keeps the recorder a plain observer of state
 * the app already maintains.
 *
 * SINGLE-FLIGHT: `startTour` rejects synchronously when a tour is already
 * active. The watcher is `takeLatest`, and a superseding start deliberately
 * skips `tourEnded` in the cancelled run's finally — `tour.active` never
 * flips false during the handoff — so a boolean latch cannot attribute a
 * later end to the earlier caller: the first promise would silently resolve
 * when the SECOND tour finished. Rejecting loudly beats reporting the wrong
 * tour as done; the harness records takes strictly one at a time anyway.
 *
 * `startClip`'s guard cannot rely SOLELY on `runTour`'s store-state check.
 * `camera.clip` is only written by `clipStarted`, which `playClip` dispatches
 * AFTER `watchClipSaga`'s `waitUntil(clipFociReady && cameraRuntime)` clears —
 * an arbitrarily long window (catalog/structure loads) during which
 * `selectClipActive` reads false. A second `startClip` in that window would
 * be accepted, `takeLatest` would cancel worker A while it's still inside
 * `waitUntil` (before `playClip` ever ran, so no `[CANCEL]` hook fires and A
 * gets no `clipEnded`), and B's normal activate/end cycle would resolve BOTH
 * latches — caller A reports success for a clip it never filmed. So `startClip`
 * ALSO guards on `clipInFlight`, a flag closed over inside
 * `installRecorderHook` (not module scope — the hook installs once per store,
 * and a module `let` would leak across installs/tests), set before dispatch
 * and cleared on every settle path, covering the pre-activation window the
 * store check misses. `selectClipActive` stays in the check too: a tour beat's
 * clip (`visitBeatSaga` calls the `playClip` seam directly, bypassing the
 * `startClip` action) can flip `camera.clip` without ever touching
 * `clipInFlight`, and the guard still needs to refuse a standalone start
 * while that's in flight.
 *
 * The `window` write goes through the `RecorderWindow` cast instead of a
 * `declare global` `interface Window` augmentation — the house style bans
 * `interface`, and the only reader is the harness's untyped `page.evaluate`
 * anyway.
 */

import { isCinemaMode } from '../../utils/url/isCinemaMode';
import { whenStablyReady } from '../lifecycle/whenStablyReady';
import { startTour } from '../tour/tourActions';
import { selectTourActive } from '../tour/selectors';
import { startClip } from '../camera/clipActions';
import { selectClipActive } from '../camera/selectors';
import type { AppStore } from '../../store/types';
import type { SkymapRecorderHook } from '../../@types/recorder/SkymapRecorderHook';
import type { RecorderWindow } from '../../@types/recorder/RecorderWindow';
import type { TourId } from '../../@types/animation/tour/TourId';
import type { BeatRange } from '../../@types/animation/tour/BeatRange';
import type { ClipId } from '../../@types/animation/ClipId';

// Dispatch the tour and resolve on the `tour.active` true → false transition.
// Tracking "seen active" (instead of resolving on any false reading) makes
// the wait immune to store changes that land before the saga flips the flag.
// Single-flight: reject up front when a tour is already running — see the
// module header for why the transition can't be attributed to a caller then.
function runTour(store: AppStore, id: TourId, beats?: BeatRange): Promise<void> {
  if (selectTourActive(store.getState())) {
    return Promise.reject(
      new Error('startTour called while a tour is already active — await the previous call first'),
    );
  }
  return new Promise((resolve) => {
    let seenActive = false;
    const unsubscribe = store.subscribe(() => {
      const active = selectTourActive(store.getState());
      if (active) {
        seenActive = true;
      } else if (seenActive) {
        unsubscribe();
        resolve();
      }
    });
    store.dispatch(startTour(id, beats));
  });
}

export function installRecorderHook(store: AppStore): void {
  if (!isCinemaMode()) return;

  // The in-flight latch — see the module header for why `runClip` cannot use
  // `selectClipActive` the way `runTour` uses `selectTourActive`.
  let clipInFlight = false;

  // Same seen-active latch `runTour` uses, guarding against `watchClipSaga`'s
  // foci/runtime `waitUntil` gate: `camera.clip` stays null across however
  // many store updates land before the clip activates, so a latch that
  // resolved on any inactive reading would resolve instantly and film zero
  // frames. Single-flight checks BOTH `clipInFlight` (covers this window) AND
  // `selectClipActive` (covers a clip started elsewhere — `visitBeatSaga`
  // calls the `playClip` seam directly, bypassing the `startClip` action
  // entirely, so a tour beat's clip flips `camera.clip` without ever touching
  // `clipInFlight`). `clipInFlight` is set before dispatch and cleared in
  // `finally` so it covers rejection paths too, not just the resolve one.
  function runClip(id: ClipId): Promise<void> {
    if (clipInFlight || selectClipActive(store.getState())) {
      return Promise.reject(
        new Error(
          'startClip called while a clip is already active — await the previous call first',
        ),
      );
    }
    clipInFlight = true;
    return new Promise<void>((resolve) => {
      let seenActive = false;
      const unsubscribe = store.subscribe(() => {
        const active = selectClipActive(store.getState());
        if (active) {
          seenActive = true;
        } else if (seenActive) {
          unsubscribe();
          resolve();
        }
      });
      store.dispatch(startClip(id));
    }).finally(() => {
      clipInFlight = false;
    });
  }

  const hook: SkymapRecorderHook = {
    ready: whenStablyReady(store),
    startTour: (id: TourId, beats?: BeatRange) => runTour(store, id, beats),
    startClip: (id: ClipId) => runClip(id),
  };
  (window as RecorderWindow).__skymapRecorder = hook;
}
