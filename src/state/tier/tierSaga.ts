/**
 * tierSaga — the watcher that turns a tier COMMAND into the tier WRITE, with the
 * engine's data-transition runner fired in between.
 *
 * The command/write split is the whole point. 'requestTier' is the command: a
 * reducer-less action a UI control or a tour step dispatches to express intent
 * ('I want the large tier'). 'setTier' is the write the saga issues once it has
 * decided the change is real. Keeping them separate means the store's tier only
 * flips on the saga's own terms, never optimistically and never as a side effect
 * of an unrelated settings merge.
 *
 * 'prev' is read BEFORE the write so the per-source tier-target diff the engine
 * runner computes stays honest — the runner needs the tier the data was loaded
 * AT to know which sources actually changed budget. Reading after the 'setTier'
 * write would hand it the new tier on both sides and the diff would always be
 * empty.
 *
 * The 'prev === payload' early-return is the same-tier no-op. Re-selecting the
 * tier that is already current is a real UI event (a dropdown re-pick); without
 * the guard it would re-issue the write and fire the runner, which today
 * unconditionally rebuilds the famous-galaxy texture atlas for nothing. The
 * guard makes the steady state idle.
 *
 * 'run?.' is defensive against the window before the engine has registered its
 * runner via 'setSagaContext'. In practice that window is closed — boot finishes
 * wiring the context long before the tier dropdown is interactive — but a guarded
 * no-op is cheaper than a throw on a path that must never crash the store.
 *
 * The transition is synchronous today: the runner's loads and famous rebuild are
 * fire-and-forget, so the saga issues the write and calls 'run' in one tick.
 * Only the 'run(...)' line would become 'yield* call(run, ...)' if a step ever
 * needed to be cancellable under 'takeLatest' (e.g. a long load the next request
 * should abort).
 */

import { takeLatest, select, put, getContext } from 'typed-redux-saga';

import { requestTier } from './requestTier';
import { setTier } from './tierSlice';
import { selectTier } from './selectors';
import type { RunTierTransition } from '../../store/types';

export function* watchTier() {
  yield* takeLatest(requestTier, function* (action) {
    const prev = yield* select(selectTier);
    if (prev === action.payload) return;
    const run = yield* getContext<RunTierTransition>('runTierTransition');
    yield* put(setTier(action.payload));
    run?.(prev, action.payload);
  });
}
