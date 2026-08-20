/**
 * applySceneEffect — the verb→side-effect table for non-fade scene cues, called
 * from clipPlayer's tick with NO saga running: direct store dispatches plus the
 * synchronous intent→fade bridge.
 *
 * `effect.over` is authored in SECONDS (like every clip-land duration) and the
 * fade bridge consumes milliseconds, so this boundary owns the conversion.
 * `over: 0` takes the snap path, which ignores the duration; `undefined` leaves
 * the default FADE_IN/OUT constants in force.
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
      // Scoped entries ('survey:milliquas') are animated by the reactive
      // settings→fade bridge, so they take no part in the explicit sync below.
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
      // Verbatim, so every reconcile saga fires for free off the middleware.
      store.dispatch(effect.action);
      return;
    }

    case 'focus': {
      // `null` clears focus, driving structureFocus recession to 0 and
      // de-isolating every structure.
      store.dispatch(updateSelectionFocus(effect.ref));
      return;
    }

    case 'frameTo': {
      // Ordering matches the interactive `watchOrientationChangeSaga`: persist the
      // target frame first, THEN start the roll. The roll seeds from the LIVE basis
      // B(t), not the destination's steady pole, so a frameTo firing mid-slerp
      // composes continuously instead of snapping back.
      //
      // Deliberately NO third `commitCameraPose(reencodePose(...))` dispatch: the
      // clip driver necessarily active here re-derives its pose every frame from
      // the current `settings.orientation`, so `camera.base` is neither rendered
      // nor baked while a clip is winning.
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
      // clipPlayer writes the clipOpacity channel directly, so reaching here is a
      // caller bug — throw rather than silently no-op.
      throw new Error(
        `applySceneEffect: 'fade' cues are owned by clipPlayer and must not be routed here (layer: ${String(effect.layers)})`,
      );
    }
  }
}
