/**
 * applySceneEffect — the verb→side-effect dispatch table for non-fade scene cues.
 *
 * This is Layer 1 of the animation architecture: it is called from clipPlayer's
 * tick phase whenever a non-fade SceneEffect cue's `atSec` is crossed. "Layer 1"
 * means the recording spikes invoke it with NO saga running — it works purely via
 * direct store dispatches and the synchronous intent→fade bridge.
 *
 * ### Five verbs; one is NOT here
 *
 * `show` / `hide` / `scene` / `focus` / `frameTo` are handled below.
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
 *    - `durationMs: effect.over * 1000` — `over` is authored in SECONDS (like
 *      every clip-land duration) and the fade bridge consumes milliseconds, so
 *      this boundary owns the conversion. `undefined` means "use the default
 *      FADE_IN/OUT constants"; `0` goes through the snap path
 *      (`animate: false`) so `durationMs` is ignored there anyway.
 *
 * ### scene
 *
 * Dispatches `effect.action` (a `SettingsAction`) verbatim. Every reconcile
 * saga (`watchFadesSaga`, `watchWakeSaga`, `watchFlowReseedSaga`, `watchBiasBakeSaga`) fires for
 * free because the store's saga middleware sees the action.
 *
 * ### focus
 *
 * Dispatches `updateSelectionFocus(effect.ref)`. `effect.ref` is a `SelectionRef`
 * or `null`; `null` clears the focus. `watchFocusTweenSaga` is parked by Plan B's
 * `suspendDuringClip`, so no camera tween is planted; `watchSelectionRowsSaga` stays
 * live, so the isolation dim fires immediately.
 *
 * ### frameTo
 *
 * Dispatches `setOrientation(effect.frame)` then `startFrameTween`, in that order
 * — the same pair, and the same live-basis capture, the interactive
 * `watchOrientationChangeSaga` performs. The roll's `fromQuat` is the live basis
 * `B(t)` resolved this frame (`liveUpBasisQuat(cameraRuntime)`), so a switch
 * firing mid-roll composes continuously instead of snapping back to a steady
 * pole. Unlike the interactive saga there is no null-runtime bail: inside a
 * running clip the frame loop has already resolved `frameBasis.current`.
 *
 * Deliberately NOT a third dispatch: `watchOrientationChangeSaga` also
 * re-encodes `camera.base` (`commitCameraPose(reencodePose(...))`); this cue
 * does not need to, because the clip driver that is necessarily active
 * whenever a `frameTo` fires re-derives its pose from scratch every frame
 * against the CURRENT `settings.orientation` (see `SceneEffect`'s `frameTo`
 * doc and `cameraDrivers.ts`'s `clip` row) — `base` is never what's rendered
 * nor what commit-on-edge bakes while a clip is winning.
 */

import type { SceneEffect } from '../../@types/animation/SceneEffect';
import type { EngineState } from '../../@types/engine/state/EngineState';
import type { AppDispatch } from '../../store/types';
import { updateSelectionFocus } from '../../state/selection/selectionSlice';
import { setOrientation } from '../../state/settings/settingsSlice';
import { startFrameTween } from '../../state/camera/cameraSlice';
import { liveUpBasisQuat } from '../engine/camera/liveUpBasisQuat';
import { syncVisibilityFades } from '../engine/wiring/syncVisibilityFades';
import { VISIBILITY_ACTION_ROW } from './visibilityActionRow';
import { scopedVisibilityActions } from './scopedVisibilityActions';

export function applySceneEffect(
  effect: SceneEffect,
  deps: { state: EngineState; store: { dispatch: AppDispatch } },
): void {
  const { state, store } = deps;

  switch (effect.kind) {
    case 'show': {
      // Dispatch the visibility-on settings actions for each layer, then sync
      // the fade bridge so the opacity animates (or snaps) to reflect the new
      // intent. Scoped entries ('survey:milliquas') dispatch their targeted
      // action instead — the reactive settings→fade bridge animates those, so
      // they take no part in the explicit sync below.
      for (const layer of effect.layers) {
        for (const action of VISIBILITY_ACTION_ROW[layer].actions(true, state.settings)) {
          store.dispatch(action);
        }
      }
      for (const scopedArg of effect.scoped ?? []) {
        for (const action of scopedVisibilityActions(scopedArg, true, state.settings)) {
          store.dispatch(action);
        }
      }
      syncVisibilityFades(state, {
        animate: effect.over !== 0,
        only: effect.layers,
        durationMs: effect.over !== undefined ? effect.over * 1000 : undefined,
      });
      return;
    }

    case 'hide': {
      // Mirror of show: dispatch visibility-off actions, then sync the bridge.
      for (const layer of effect.layers) {
        for (const action of VISIBILITY_ACTION_ROW[layer].actions(false, state.settings)) {
          store.dispatch(action);
        }
      }
      for (const scopedArg of effect.scoped ?? []) {
        for (const action of scopedVisibilityActions(scopedArg, false, state.settings)) {
          store.dispatch(action);
        }
      }
      syncVisibilityFades(state, {
        animate: effect.over !== 0,
        only: effect.layers,
        durationMs: effect.over !== undefined ? effect.over * 1000 : undefined,
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

    case 'frameTo': {
      // Reorient the "up" pole to effect.frame — the clip-land twin of the
      // interactive requestOrientationChange saga, and identical in ordering:
      // persist the target frame first (setOrientation), THEN start the roll.
      //
      // The roll seeds from the LIVE basis B(t) resolved this frame, captured
      // as a quaternion — NOT the destination frame's steady pole. During a
      // slerp the resolved basis sits between two frames, so a frameTo firing
      // mid-roll must compose continuously from wherever the pole is now rather
      // than snapping back.
      const fromQuat = liveUpBasisQuat(state.cameraRuntime);
      store.dispatch(setOrientation(effect.frame));
      store.dispatch(
        startFrameTween({
          fromQuat,
          to: effect.frame,
          durationMs: effect.over * 1000,
          easing: effect.ease,
        }),
      );
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
