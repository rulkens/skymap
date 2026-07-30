/**
 * watchHashWriteSaga — the store→URL half of the hash sync. On every dispatched
 * action that any `HASH_PARAM_SOURCES` row declares as one of its triggers, it
 * recomposes the WHOLE hash body from the fresh store state and hands it to
 * `writeHashBody`, which owns the compare-and-skip and the `pushState`.
 *
 * Recomposing everything on any trigger — rather than patching the one param
 * whose row fired — is what makes the trigger sets forgiving. A row that fires
 * for an action its own value did not move simply rewrites the same bytes and
 * `writeHashBody` skips; a row that fails to fire is republished by the next
 * trigger from any other row. The failure mode of a wrong `writesOn` is
 * therefore "stale", never "wrong", which is the contract the table's docblock
 * states and the reason prose discipline is the guard there.
 *
 * `takeEvery` is live from the instant this saga starts, so WHEN it starts is
 * load-bearing: publishing before the arrival read has applied the URL would
 * compose the store's defaults and `pushState` them over the visitor's deep
 * link. `watchHashSaga` holds both halves until the app that owns the window
 * exists, which is why this saga carries no such wait of its own — and why
 * forking it standalone, without a parent doing the waiting, is not safe.
 *
 * ### Why an enumerated trigger and not `takeEvery('*')`
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
 * ### Why the predicate lives here and not on the rows
 *
 * Each row declares its triggers in whichever form fits its slice — a
 * slice-prefix predicate where the whole slice is intent (`t`), an explicit list
 * where the slice also carries a hot stream (`focus`, `orientation`). This saga
 * is the one place that has to flatten those two forms into a single yes/no, so
 * the `typeof` fork sits here, once, rather than forcing every row to normalise
 * itself into a shape it does not naturally have.
 */

import { takeEvery, call, select } from 'typed-redux-saga';
import type { Action } from '@reduxjs/toolkit';

import { HASH_PARAM_SOURCES } from './hashParamSources';
import { hashBodyFor } from './hashBodyFor';
import { writeHashBody } from '../../services/url/writeHashBody';
import type { RootState } from '../../store/types';

const isHashWrite = (action: Action): boolean =>
  HASH_PARAM_SOURCES.some((source) =>
    typeof source.writesOn === 'function'
      ? source.writesOn(action)
      : source.writesOn.some((matcher) => matcher.match(action)),
  );

export function* watchHashWriteSaga() {
  yield* takeEvery(isHashWrite, function* () {
    // The whole state, because `write` takes `RootState` — the rows name the
    // selectors they need, so nothing here has to know which slices the hash
    // reads. The saga middleware runs after the reducers, so this is already
    // the post-action state.
    const state = yield* select((s: RootState) => s);
    yield* call(writeHashBody, hashBodyFor(state));
  });
}
