/**
 * applySceneEffect — the verb→side-effect table for non-fade scene cues, called
 * from clipPlayer's tick with NO saga running: direct store dispatches only.
 *
 * `effect.over` is authored in SECONDS (like every clip-land duration) and the
 * fade sync consumes milliseconds, so this boundary owns the conversion.
 * `over: 0` snaps; `undefined` leaves the default FADE_IN/OUT constants in force.
 */

import type { SceneEffect } from '../../@types/animation/SceneEffect';
import type { EngineState } from '../../@types/engine/state/EngineState';
import type { AppDispatch } from '../../store/types';
import { updateSelectionFocus } from '../../state/selection/selectionSlice';
import { setOrientation } from '../../state/settings/core/orientationSlice';
import { startFrameTween } from '../../state/camera/cameraSlice';
import { liveUpBasisQuat } from '../engine/camera/liveUpBasisQuat';
import { setVisibilityActionsFor } from '../../utils/visibility/setVisibilityActionsFor';

export function applySceneEffect(
  effect: SceneEffect,
  deps: { state: EngineState; store: { dispatch: AppDispatch } },
): void {
  const { state, store } = deps;

  switch (effect.kind) {
    case 'show':
    case 'hide': {
      // The duration rides the writes: the reactive sync each one wakes is the only sync, and
      // it runs inside `dispatch`, before any explicit sync here could.
      const on = effect.kind === 'show';
      const overMs = effect.over === undefined ? undefined : effect.over * 1000;
      for (const arg of effect.args) {
        for (const action of setVisibilityActionsFor(state.settings, arg, on, overMs)) {
          store.dispatch(action);
        }
      }
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
      // No explicit `commitCameraPose` here: the loop re-encodes `base` itself
      // the frame it sees `settings.orientation` change (`stepCameraRuntime`),
      // and the clip driver active here renders from `settings.orientation`
      // directly anyway, never from `base`.
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
        `applySceneEffect: 'fade' cues are owned by clipPlayer and must not be routed here (args: ${String(effect.args)})`,
      );
    }
  }
}
