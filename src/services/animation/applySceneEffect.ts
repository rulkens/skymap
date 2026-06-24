/**
 * applySceneEffect — the verb→side-effect dispatch table for non-fade scene cues.
 *
 * This is Layer 1 of the animation architecture: it is called from clipPlayer's
 * tick phase whenever a non-fade SceneEffect cue's `atSec` is crossed. "Layer 1"
 * means the recording spikes invoke it with NO saga running — it works purely via
 * direct store dispatches and the synchronous intent→fade bridge.
 *
 * ### Four verbs; one is NOT here
 *
 * `show` / `hide` / `scene` / `focus` are handled below.
 *
 * The `fade` verb is clipPlayer's OWN: it writes the `clipOpacity` channel
 * (the clip-owned per-layer FadeController set) directly — it does NOT route
 * through this function. If a `fade` effect reaches here (e.g. a caller bug),
 * the exhaustive switch throws rather than silently discarding it.
 *
 * ### show / hide
 *
 * 1. For each layer in `effect.layers`, look up the layer's factory in
 *    `VISIBILITY_ACTION_ROW` and dispatch every returned action. This is the
 *    SAME action the UI dispatches when the user toggles a layer — the intent
 *    is written to the settings store first, then the fade bridge syncs.
 *
 * 2. After all actions are dispatched, call `syncVisibilityFades` with:
 *    - `only: effect.layers` so only the affected layers are re-synced.
 *    - `animate: effect.over !== 0` — `over === 0` snaps; `over === undefined`
 *      or a positive number animates.
 *    - `durationMs: effect.over` — forwarded to `applyIntent` so a clip cue
 *      with a custom `over` overrides the default FADE_IN/OUT constants.
 *      `undefined` means "use the defaults"; `0` goes through the snap path
 *      (`animate: false`) so `durationMs` is ignored there anyway.
 *
 * ### scene
 *
 * Dispatches `effect.action` (a `SettingsAction`) verbatim. Every reconcile
 * saga (`watchFades`, `watchWake`, `watchFlowReseed`, `watchBiasBake`) fires for
 * free because the store's saga middleware sees the action.
 *
 * ### focus
 *
 * Dispatches `updateSelectionFocus(effect.ref)`. `effect.ref` is a `SelectionRef`
 * or `null`; `null` clears the focus. `watchFocusTween` is parked by Plan B's
 * `suspendDuringClip`, so no camera tween is planted; `watchSelectionRows` stays
 * live, so the isolation dim fires immediately.
 */

import type { SceneEffect } from '../../@types/animation/SceneEffect';
import type { EngineState } from '../../@types/engine/state/EngineState';
import type { AppDispatch } from '../../store/types';
import { updateSelectionFocus } from '../../state/selection/selectionSlice';
import { syncVisibilityFades } from '../engine/wiring/syncVisibilityFades';
import { VISIBILITY_ACTION_ROW } from './visibilityActionRow';

export function applySceneEffect(
  effect: SceneEffect,
  deps: { state: EngineState; store: { dispatch: AppDispatch } },
): void {
  const { state, store } = deps;

  switch (effect.kind) {
    case 'show': {
      // Dispatch the visibility-on settings actions for each layer, then sync
      // the fade bridge so the opacity animates (or snaps) to reflect the new
      // intent.
      for (const layer of effect.layers) {
        for (const action of VISIBILITY_ACTION_ROW[layer](true, state.settings)) {
          store.dispatch(action);
        }
      }
      syncVisibilityFades(state, {
        animate: effect.over !== 0,
        only: effect.layers,
        durationMs: effect.over,
      });
      return;
    }

    case 'hide': {
      // Mirror of show: dispatch visibility-off actions, then sync the bridge.
      for (const layer of effect.layers) {
        for (const action of VISIBILITY_ACTION_ROW[layer](false, state.settings)) {
          store.dispatch(action);
        }
      }
      syncVisibilityFades(state, {
        animate: effect.over !== 0,
        only: effect.layers,
        durationMs: effect.over,
      });
      return;
    }

    case 'scene': {
      // Dispatch the settings action verbatim. Every reconcile saga fires for free.
      store.dispatch(effect.action);
      return;
    }

    case 'focus': {
      // Update the selection focus intent. null clears focus (drives
      // structureFocus recession to 0, de-isolating all structures).
      store.dispatch(updateSelectionFocus(effect.ref));
      return;
    }

    case 'fade': {
      // The fade verb is clipPlayer's own — it writes the clipOpacity channel
      // directly and never routes through applySceneEffect. Reaching here is a
      // caller bug; throw to surface it rather than silently no-op.
      throw new Error(
        `applySceneEffect: 'fade' cues are owned by clipPlayer and must not be routed here (layer: ${String(effect.layers)})`,
      );
    }
  }
}
