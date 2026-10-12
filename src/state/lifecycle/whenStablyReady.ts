/**
 * whenStablyReady — resolve once the app has been "measure-ready" for an
 * uninterrupted `READY_STABLE_MS`, so the base hook's `ready` and the perf
 * hook's `setTier` share one debounce. Ready is engine `ready`, no load in flight and the boot link
 * arrived; `loadProgress` is also null before the first fetch registers, so a
 * first-true resolve would fire mid-bootstrap. A store subscription arms a
 * timer on a true reading and disarms it on a false one. Over-waiting costs
 * nothing: the harness only switches to virtual time after this resolves.
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

export function whenStablyReady(store: AppStore): Promise<void> {
  return new Promise((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const check = (): void => {
      // A failed arrival is terminal (only the boot read and `arrivalSaga`
      // write it), so it rejects on sight rather than joining the debounce.
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
