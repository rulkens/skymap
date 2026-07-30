/**
 * watchHashSaga — the `window.location.hash` bridge, entire. One fork line in
 * `mainSaga` for both directions.
 *
 * ### Why one parent over two forks
 *
 * The read and write halves are not two features that happen to sit near each
 * other: they share one resource (the address bar), one table
 * (`HASH_PARAM_SOURCES`) and one invariant — that `pushState` fires no
 * `hashchange`, which is the only reason they can run concurrently over that
 * resource without feeding each other. Forking them separately would put that
 * relatedness nowhere: `mainSaga`'s list would read as two independent
 * watchers, and a future reader deciding whether the write may switch to
 * `replaceState` would have no single place where the pair's contract lives.
 * A parent puts them under one name and one docblock.
 *
 * ### Why still two sagas
 *
 * Their control flow has nothing in common. The read half owns a channel and
 * blocks on it in a drain loop with a teardown; the write half is a stateless
 * `takeEvery` over an action predicate. Folding them into one body would need
 * an inner fork anyway — the same two sagas, minus the names.
 *
 * ### Why the gate is here and not in either half
 *
 * `createAppStore` runs the root saga INSIDE the factory, before it returns, so
 * this saga starts while the app that owns the window is still being built. At
 * boot the URL is an INPUT, and neither half may touch it until the engine has
 * registered the capabilities behind it. That is ONE precondition the two halves
 * share, not two that happen to coincide:
 *
 *  - The read would dispatch into watchers that resolve engine capabilities
 *    through `getContext`. Reached with an empty context bag they throw, and
 *    redux-saga propagates a watcher's throw to the ROOT, cancelling every other
 *    watcher with it — see `watchHashReadSaga` for which capabilities and what a
 *    single deep link would cost.
 *  - The write is live from the moment its `takeEvery` starts. A trigger
 *    dispatched before the arrival read has run composes the DEFAULT body out of
 *    a store still sitting at its defaults and `pushState`s it over the
 *    visitor's deep link. Nothing dispatches a trigger in that window today —
 *    `main.tsx` builds the store, React mounts, `useEngine` calls
 *    `createEngine`, and `createEngine` registers the context synchronously — so
 *    this closes a latent hazard rather than a live bug.
 *
 * A precondition both children share belongs to the parent, stated once. This is
 * the second fact this file exists to hold, next to the `pushState`-fires-no-
 * `hashchange` contract above.
 *
 * The consequence is that NEITHER half is safe to fork standalone: both assume
 * something above them has already waited. Anything forking one directly — a
 * test included — takes that wait on itself, or has to know that nothing inside
 * its own fork needs it.
 *
 * `setSagaContext` is what ends the wait, and `createEngine` calls it
 * synchronously, before it kicks off the async bootstrap IIFE. So the arrival
 * read's `setOrientation` and focus request are committed by the time
 * `wireInput` reads `selectOrientation` for `computeInitialCamera` and checks
 * `selectHasSelectionIntent` for its Earth seed; see `wireInput`'s boot-ordering
 * note, which depends on that gap and would break if registration moved into the
 * bootstrap phases. A store nobody registers a context on never reads or writes
 * the hash at all — the honest answer for a store with nothing behind it.
 */

import { all, take } from 'typed-redux-saga';

import { watchHashReadSaga } from './watchHashReadSaga';
import { watchHashWriteSaga } from './watchHashWriteSaga';
import { sagaContextRegistered } from '../../store/sagaContextRegistered';

export function* watchHashSaga() {
  yield* take(sagaContextRegistered);
  yield* all([watchHashReadSaga(), watchHashWriteSaga()]);
}
