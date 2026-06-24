/**
 * waitUntil — saga helper that polls a predicate until it returns true.
 *
 * ### Why poll instead of take-based waiting
 *
 * The tour's readiness condition ("is the focus target's cloud loaded?") is
 * not expressed as a Redux action — it is a transient engine-side fact that
 * goes true when the GPU cloud upload completes, not when an RTK action fires.
 * A `take`-based wait would require the engine to dispatch a specific "cloud
 * loaded" action for each source, coupling the loading machinery to the tour
 * machinery. Polling a pure predicate every POLL_MS avoids that coupling:
 * the predicate reads the already-available `resolveDeps()` snapshot, the
 * same call the reconciler saga uses.
 *
 * ### Why it returns immediately when the predicate is already true
 *
 * Narration beats (null focus) and structure/milkyWay beats always resolve
 * immediately. Entering the poll loop for them would add an unnecessary 100ms
 * latency before every beat. The `while (!pred())` guard short-circuits for
 * the common case.
 */

import { delay } from 'typed-redux-saga';

/** Poll interval in milliseconds. Short enough to feel responsive; long
 *  enough not to spin-hammer the predicate. */
const POLL_MS = 100;

/**
 * Yields until `pred()` returns true, polling every POLL_MS milliseconds.
 * Returns immediately if the predicate is already satisfied on the first call.
 */
export function* waitUntil(pred: () => boolean): Generator {
  while (!pred()) {
    yield* delay(POLL_MS);
  }
}
