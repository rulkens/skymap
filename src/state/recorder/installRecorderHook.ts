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
 * "Capture-ready" is two facts already in the store: the engine reports
 * `status.kind === 'ready'` and the load-progress aggregate is `null` (its
 * "nothing in flight" convention). But `loadProgress` is ALSO null before the
 * first slot starts, so the naive "resolve the first time the predicate reads
 * true" would fire mid-bootstrap, in the gap between engine-ready and the
 * first fetch registering. Instead the installer subscribes to the store and
 * requires the predicate to HOLD for `READY_STABLE_MS` continuously: each
 * store change re-evaluates it, a true reading arms a timer, a false reading
 * disarms it, and only an undisturbed window resolves the promise. Polling
 * would also work but subscribe is edge-triggered and free. Over-waiting a
 * full second costs nothing — boot runs in real wall-clock time; the harness
 * only switches the page onto CDP virtual time AFTER awaiting `ready`.
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
import { startTour } from '../tour/tourActions';
import { selectTourActive } from '../tour/selectors';
import { selectEngineStatus, selectLoadProgress } from '../engine/selectors';
import type { AppStore } from '../../store/types';
import type { SkymapRecorderHook } from '../../@types/recorder/SkymapRecorderHook';
import type { RecorderWindow } from '../../@types/recorder/RecorderWindow';
import type { TourId } from '../../@types/animation/tour/TourId';
import type { BeatRange } from '../../@types/animation/tour/BeatRange';

/**
 * How long the ready predicate must hold, uninterrupted, before `ready`
 * resolves. Exported so tests can advance fake timers by exactly this window.
 */
export const READY_STABLE_MS = 1000;

// Engine running + no load in flight. Momentarily true mid-bootstrap (see the
// module header), hence the stability window around it.
function isSettled(store: AppStore): boolean {
  const state = store.getState();
  return selectEngineStatus(state).kind === 'ready' && selectLoadProgress(state) === null;
}

// Resolve once `isSettled` has held for READY_STABLE_MS without a single
// false reading in between. The timer is armed on the first true reading and
// disarmed by any false one; the subscription is dropped once resolved.
function whenStablyReady(store: AppStore): Promise<void> {
  return new Promise((resolve) => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const check = (): void => {
      if (isSettled(store)) {
        timer ??= setTimeout(() => {
          unsubscribe();
          resolve();
        }, READY_STABLE_MS);
      } else if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
    };
    const unsubscribe = store.subscribe(check);
    // The predicate may already be true at install time — evaluate once
    // immediately rather than waiting for the next store change.
    check();
  });
}

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
