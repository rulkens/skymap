/**
 * restoreSceneSaga — put a captured `SceneSnapshot` back onto the live store:
 * settings, then selection focus. Pure Intent — two dispatches, no engine context.
 *
 * This is the close of the tour's capture → play → restore round-trip
 * (`captureScene` is the open). `guidedTourSaga` runs it in its `finally`, so it
 * fires on BOTH a natural tour finish and an `exitTour`/supersede cancellation.
 *
 *   1. `put(mergeSnapshot(settings))` — the six clusters land in ONE merge
 *      dispatch (one transition, one store notification — what wakes React's
 *      settings subscribers). The fade follows REACTIVELY: `watchFadesSaga`
 *      reacts to `mergeSnapshot` and re-fades every layer to the restored intent.
 *      So this saga drives no fade itself — settings-write → fade is the
 *      watcher's one job, the same as for every other settings write.
 *
 *   2. `put(updateSelectionFocus(focus))` — focus reverts through the same
 *      production action a user interaction or a `focus()` beat uses. Routing
 *      through dispatch keeps the store coherent: the selection reconciler saga
 *      re-computes `selectionRows`, and the ring / isolation dim / camera tween
 *      all follow. A direct slot assignment would bypass the store and strand
 *      them stale.
 *
 * Why no engine context: capture is a pure read and restore is pure Intent, so
 * the whole round-trip stays in store-land. The only engine touch (the fade
 * pass) is the existing `syncFades`, reached by `watchFadesSaga`, not by this
 * saga — keeping the `ReconcileEffects` boundary from growing a restore method.
 *
 * Both `put`s block until their reducer applies (true even inside a `finally`
 * driven by a cancelling dispatch), so on a supersede the restore lands fully
 * before the successor run's snapshot reads the store.
 *
 * `clipOpacity` is already reset to 1 at clip end by the clip runner, so
 * transient fade-to-black effects need no undo here.
 */

import { put } from 'typed-redux-saga';

import { mergeSnapshot } from '../settings/settingsSlice';
import { updateSelectionFocus } from '../selection/selectionSlice';
import type { SceneSnapshot } from '../../@types/engine/settings/SceneSnapshot';

export function* restoreSceneSaga(snapshot: SceneSnapshot): Generator {
  yield* put(mergeSnapshot(snapshot.settings));
  yield* put(updateSelectionFocus(snapshot.focus));
}
