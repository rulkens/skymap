/**
 * makeReconcileEffects — binds engine-side closures into the `ReconcileEffects`
 * surface the saga context exposes: sagas drive Intent, these are the engine
 * callbacks they call afterwards, in one registration point (intent.md §5).
 */

import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { ReconcileEffects } from '../../../store/effects/ReconcileEffects';
import { logCameraState } from '../helpers/logCameraState';
import { liveRenderCamera } from '../helpers/liveRenderCamera';
import { liveFocusRow } from '../helpers/liveFocusRow';
import { syncVisibilityFades } from './syncVisibilityFades';
import { applySwapFormat } from '../phases/applySwapFormat';

export function makeReconcileEffects(
  state: EngineState,
  canvas: HTMLCanvasElement,
): ReconcileEffects {
  return {
    requestRender: () => state.subsystems.scheduler.requestRender(),
    syncFades: () => syncVisibilityFades(state, { animate: true }),
    logCameraState: () => {
      const simDays = state.cameraRuntime.outputs.simDays;
      const cam = liveRenderCamera(state);
      logCameraState(
        cam,
        canvas,
        liveFocusRow(state.selectionRows.focus, simDays),
        simDays,
        state.subsystems.surfaceTiles?.getDebugSnapshot().subCamera ?? null,
        state.cameraRuntime.outputs.displayed,
      );
      return cam === null ? null : { framed: state.cameraRuntime.outputs.displayed, simDays };
    },
    applySwapFormat: (desired) => applySwapFormat(state, desired),
  };
}
