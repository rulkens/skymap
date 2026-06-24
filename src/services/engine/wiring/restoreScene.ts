/**
 * restoreScene — put a captured `SceneSnapshot` back onto the live engine
 * state: settings first, then selection focus.
 *
 * This is the close of the tour's capture → play → restore round-trip
 * (`captureScene` is the open). Two ordered steps:
 *
 *   1. `restoreSettings` — the six settings clusters land in ONE
 *      `store.dispatch(mergeSnapshot(...))` and the visibility-fade bridge
 *      re-syncs every intent row to the restored state. See `restoreSettings`
 *      for the full rationale.
 *
 *   2. `store.dispatch(updateSelectionFocus(snapshot.focus))` — focus is
 *      reverted through the same production action surface that a user
 *      interaction or a `focus()` beat would use. Routing through dispatch
 *      keeps the store coherent (React subscribers wake, the selection
 *      reconciler saga observes the change and re-computes `selectionRows`).
 *      A direct assignment to `state.selection.focus` would bypass the store
 *      and leave the ring, the isolation dim, and the camera tween all stale.
 *
 * `clipOpacity` is already reset to 1 at clip end by the clip runner, so
 * transient fade-to-black effects need no undo here.
 */

import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { SceneSnapshot } from '../../../@types/engine/settings/SceneSnapshot';
import type { AppStore } from '../../../store/types';
import { updateSelectionFocus } from '../../../state/selection/selectionSlice';
import { restoreSettings } from './restoreSettings';

export function restoreScene(
  state: EngineState,
  store: AppStore,
  snapshot: SceneSnapshot,
  opts: { animate: boolean },
): void {
  // Settings first: one copy-on-write swap + full bridge pass (see restoreSettings).
  restoreSettings(state, store, snapshot.settings, opts);

  // Focus second: through the production action so the store stays coherent.
  store.dispatch(updateSelectionFocus(snapshot.focus));
}
