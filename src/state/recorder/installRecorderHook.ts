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
 * The `window` write goes through the `RecorderWindow` cast instead of a
 * `declare global` `interface Window` augmentation — the house style bans
 * `interface`, and the only reader is the harness's untyped `page.evaluate`
 * anyway.
 */

import { isCinemaMode } from '../../utils/url/isCinemaMode';
import { whenStablyReady } from '../lifecycle/whenStablyReady';
import { startTour } from '../tour/tourActions';
import { selectTourActive } from '../tour/selectors';
import type { AppStore } from '../../store/types';
import type { SkymapRecorderHook } from '../../@types/recorder/SkymapRecorderHook';
import type { RecorderWindow } from '../../@types/recorder/RecorderWindow';
import type { TourId } from '../../@types/animation/tour/TourId';
import type { BeatRange } from '../../@types/animation/tour/BeatRange';

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
  const hook: SkymapRecorderHook = {
    ready: whenStablyReady(store),
    startTour: (id: TourId, beats?: BeatRange) => runTour(store, id, beats),
  };
  (window as RecorderWindow).__skymapRecorder = hook;
}
