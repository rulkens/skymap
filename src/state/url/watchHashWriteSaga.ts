/**
 * watchHashWriteSaga — the store→URL half of the hash sync. Once the dispatch
 * stream has gone quiet, it recomposes the WHOLE hash body from the settled
 * store state and hands it to `writeHashBody`, which owns the compare-and-skip
 * and the `pushState`.
 *
 * Recomposing everything on any trigger — rather than patching the one param
 * whose row fired — is what makes the trigger sets forgiving. A row that fires
 * for an action its own value did not move simply rewrites the same bytes and
 * `writeHashBody` skips; a row that fails to fire is republished by the next
 * trigger from any other row. The failure mode of a wrong `writesOn` is
 * therefore "stale", never "wrong", which is the contract the table's docblock
 * states and the reason prose discipline is the guard there.
 *
 * ### One publish per SETTLED state, not one per trigger
 *
 * `debounce(0, …)` rather than `takeEvery`, and the reason is the history stack.
 * Applying one URL is not one action: `watchHashReadSaga`'s `applyHash` walks the
 * table and dispatches a row's worth of actions at a time, each of them a write
 * trigger in its own right, and the selection reconciler adds hops of its own on
 * top. Under `takeEvery` every one of those published, so applying
 * `#focus=body-mars&orientation=galactic` composed `focus=body-mars` from a store
 * that had applied the focus row and not yet the orientation row, pushed it, and
 * only then pushed the real thing. Two history entries for one navigation — and
 * because `pushState` during a Back navigation truncates the forward stack, the
 * visible symptom is a dead Forward button rather than a stray URL.
 *
 * A per-row write can only ever be right by luck, because no row's write output
 * is a function of its own row alone: `write` composes the whole body, so it is
 * correct exactly when every row has landed. `delay(0)` is a MACROTASK, which is
 * strictly longer than the synchronous `applyHash` burst plus the microtask and
 * scheduler hops the reconciler takes, so the worker composes once, from a store
 * nothing is still in the middle of changing.
 *
 * `takeLatest(isHashWrite, function* () { yield* delay(0); … })` is the same
 * machine in the vocabulary the rest of this repo uses, and it was the first
 * spelling tried. `debounce` won because it NAMES the intent: the point is not
 * that a later trigger cancels an earlier worker, it is that the burst has a
 * trailing edge and the publish belongs on it. A reader of the `takeLatest` form
 * has to reconstruct that from the `delay(0)`.
 *
 * The debounce does NOT make `writeHashBody`'s compare-and-skip redundant, and
 * removing it re-breaks a cold load: the settled body of a deep-link arrival
 * equals the URL the visitor arrived on, and only the compare turns that publish
 * into a no-op instead of an entry the visitor never navigated to.
 *
 * The watcher is live from the instant this saga starts, so WHEN it starts is
 * load-bearing: publishing before the arrival read has applied the URL would
 * compose the store's defaults and `pushState` them over the visitor's deep
 * link. `watchHashSaga` holds both halves until the app that owns the window
 * exists, which is why this saga carries no such wait of its own — and why
 * forking it standalone, without a parent doing the waiting, is not safe.
 *
 * ### Why an enumerated trigger and not `'*'`
 *
 * `'*'` would be simpler to write and correct by construction, and it is exactly
 * what the frame path cannot afford. `commitCameraPose` bakes a new resting pose
 * on every orbit-controls gesture, and `engineBodyDistanceReported` /
 * `engineScaleChanged` report from inside the render loop — none of which can
 * move any row's `write` output, and all of which would drag a full state read,
 * a table walk, a string compose and a `location.hash` read onto a 60 Hz path.
 * So the predicate asks the table instead: an action triggers a write only if
 * some row claims it. Nothing in the frame stream matches, which is the entire
 * purchase of enumerating `writesOn`.
 *
 * The debounce is no substitute for that. A 0 ms trailing edge is shorter than
 * the gap between two frames, so a 60 Hz stream of triggers would still compose
 * once per frame — coalescing bounds a BURST, it does not throttle a stream.
 *
 * ### Why the predicate lives here and not on the rows
 *
 * Every row states its triggers as a list of predicates over an action, so this
 * saga's job is a plain "does any row claim it" — a nested `some`, with nothing
 * to normalise. It used to be a `typeof` fork over two trigger FORMS (a list of
 * action creators, or a bare predicate); collapsing them into the one form both
 * can spell (`.match` already is a predicate) deleted the fork and let a single
 * row mix named actions with a computed test, which `focus` now does.
 */

import { debounce, call, select } from 'typed-redux-saga';
import type { Action } from '@reduxjs/toolkit';

import { HASH_PARAM_SOURCES } from './hashParamSources';
import { hashBodyFor } from './hashBodyFor';
import { writeHashBody } from '../../services/url/writeHashBody';
import type { RootState } from '../../store/types';

const isHashWrite = (action: Action): boolean =>
  HASH_PARAM_SOURCES.some((source) => source.writesOn.some((triggers) => triggers(action)));

export function* watchHashWriteSaga() {
  yield* debounce(0, isHashWrite, function* () {
    // The whole state, because `write` takes `RootState` — the rows name the
    // selectors they need, so nothing here has to know which slices the hash
    // reads. Read AFTER the debounce window, so this is the state the burst
    // settled on rather than the state the trigger that opened it produced.
    const state = yield* select((s: RootState) => s);
    yield* call(writeHashBody, hashBodyFor(state));
  });
}
