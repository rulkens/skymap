/**
 * whenStablyReady — resolve once the app has been "measure-ready" for an
 * uninterrupted stability window.
 *
 * Shared by both external-harness seams (`installRecorderHook`,
 * `installPerfHook`): each awaits this before it does anything that assumes a
 * settled scene (the recorder switches the page onto CDP virtual time; the perf
 * hook starts driving poses and sampling GPU timings). Extracting it here keeps
 * the debounce authored ONCE rather than duplicated per hook.
 *
 * ### A debounced predicate, not a first-true resolve
 *
 * "Measure-ready" is three facts already in the store: the engine reports
 * `status.kind === 'ready'`, the load-progress aggregate is `null` (its
 * "nothing in flight" convention), and the boot link's subject has arrived
 * (`arrival.status === 'arrived'`). But `loadProgress` is ALSO null before the
 * first slot starts, so the naive "resolve the first time the predicate reads
 * true" would fire mid-bootstrap, in the gap between engine-ready and the first
 * fetch registering. Instead we subscribe to the store and require the
 * predicate to HOLD for `READY_STABLE_MS` continuously: each store change
 * re-evaluates it, a true reading arms a timer, a false reading disarms it, and
 * only an undisturbed window resolves the promise. Polling would also work but
 * subscribe is edge-triggered and free. Over-waiting a full second costs
 * nothing — boot runs in real wall-clock time; the harness only switches onto
 * virtual time / starts sampling AFTER awaiting this.
 *
 * `arrival.status === 'failed'` is terminal and un-flickering (`arrivalSlice`'s
 * header: only the boot read and `arrivalSaga` write it), so it rejects on
 * sight rather than joining the debounce.
 */

import { selectEngineStatus, selectLoadProgress } from '../engine/selectors';
import { selectArrival } from '../arrival/selectors';
import type { AppStore } from '../../store/types';

/**
 * How long the ready predicate must hold, uninterrupted, before `ready`
 * resolves. Exported so tests can advance fake timers by exactly this window.
 */
export const READY_STABLE_MS = 1000;

// Engine running + no load in flight + the boot link's subject on screen.
// Momentarily true mid-bootstrap (see the module header), hence the
// stability window around it.
function isSettled(store: AppStore): boolean {
  const state = store.getState();
  return (
    selectEngineStatus(state).kind === 'ready' &&
    selectLoadProgress(state) === null &&
    selectArrival(state).status === 'arrived'
  );
}

// Resolve once `isSettled` has held for READY_STABLE_MS without a single
// false reading in between. The timer is armed on the first true reading and
// disarmed by any false one; the subscription is dropped once resolved. A
// `failed` arrival rejects immediately, timer or no timer.
export function whenStablyReady(store: AppStore): Promise<void> {
  return new Promise((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const check = (): void => {
      const arrival = selectArrival(store.getState());
      if (arrival.status === 'failed') {
        if (timer !== null) clearTimeout(timer);
        unsubscribe();
        reject(new Error(`arrival failed: ${arrival.reason ?? 'unknown reason'}`));
        return;
      }
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
