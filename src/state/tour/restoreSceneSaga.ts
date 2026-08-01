/**
 * restoreSceneSaga — put a captured `SceneSnapshot` back onto the live store:
 * settings, then orientation, then selection focus. Pure Intent — three
 * dispatches, no engine context of its own.
 *
 * This is the close of the tour's capture → play → restore round-trip
 * (`captureScene` is the open). `guidedTourSaga` runs it in its `finally`, so it
 * fires on BOTH a natural tour finish and an `exitTour`/supersede cancellation.
 *
 *   1. `put(mergeSnapshot(settings))` — the ten clusters land in ONE merge
 *      dispatch (one transition, one store notification — what wakes React's
 *      settings subscribers). The fade follows REACTIVELY: `watchFadesSaga`
 *      reacts to `mergeSnapshot` and re-fades every layer to the restored intent.
 *      So this saga drives no fade itself — settings-write → fade is the
 *      watcher's one job, the same as for every other settings write.
 *      `orientation` lives on `SceneSnapshot` (not inside `settings`), so it
 *      cannot ride this dispatch even by accident — see `SceneSnapshot`'s
 *      header. A raw write to `orientation` would leave `camera.base`
 *      expressed in the OLD basis while the pole flips under it — the same
 *      "eye jumps" landmine `watchOrientationChangeSaga` re-expresses `base`
 *      to avoid on every interactive switch.
 *
 *   2. `put(requestOrientationChange(orientation))` — the captured pre-tour
 *      frame restores through the SAME request path an interactive switch
 *      uses, so `watchOrientationChangeSaga` re-expresses `camera.base` into it
 *      and rolls the up-basis, rather than snapping only the setting.
 *
 *   3. `put(updateSelectionFocus(focus))` — focus reverts through the same
 *      production action a user interaction or a `focus()` beat uses. Routing
 *      through dispatch keeps the store coherent: the selection reconciler saga
 *      re-computes `selectionRows`, and the ring / isolation dim / camera tween
 *      all follow. A direct slot assignment would bypass the store and strand
 *      them stale.
 *
 * Why no engine context here: capture is a pure read and restore is pure
 * Intent, so this saga itself reaches no `getContext`. `requestOrientationChange`
 * IS handled by a saga that reads `cameraRuntime` (`watchOrientationChangeSaga`),
 * but that context lives in the watcher, not here — same split as the fade
 * pass, reached by `watchFadesSaga` rather than by this saga.
 *
 * All three `put`s block until their effect lands (true even inside a `finally`
 * driven by a cancelling dispatch), so on a supersede the restore completes
 * before the successor run's snapshot reads the store.
 *
 * `clipOpacity` is already reset to 1 at clip end by the clip runner, so
 * transient fade-to-black effects need no undo here.
 */

import { put } from 'typed-redux-saga';

import { mergeSnapshot } from '../settings/settingsSlice';
import { updateSelectionFocus } from '../selection/selectionSlice';
import { requestOrientationChange } from '../camera/orientationActions';
import type { SceneSnapshot } from '../../@types/engine/settings/SceneSnapshot';

export function* restoreSceneSaga(snapshot: SceneSnapshot): Generator {
  yield* put(mergeSnapshot(snapshot.settings));
  yield* put(requestOrientationChange(snapshot.orientation));
  yield* put(updateSelectionFocus(snapshot.focus));
}
