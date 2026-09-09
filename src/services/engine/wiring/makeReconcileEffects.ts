/**
 * makeReconcileEffects — binds engine-side closures into the `ReconcileEffects`
 * surface the saga context exposes: sagas drive Intent, these are the engine
 * callbacks they call afterwards, in one registration point (intent.md §5).
 *
 * `syncFades` forwards its optional `rows` straight through as `only` —
 * `undefined` re-fades every row, the full pass a tour restore triggers.
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
    syncFades: (rows) => syncVisibilityFades(state, { animate: true, only: rows }),
    reseedFlow: () => state.gpu.flowFieldRenderer?.maybeReseed(),
    bakeBias: (mode) => void state.subsystems.biasCorrection.setMode(mode),
    // The LIVE rendered pose, assembled fresh — never the stale `state.cam`.
    logCameraState: () => {
      const simDays = state.cameraRuntime.lastRenderedSimDays.current;
      logCameraState(
        liveRenderCamera(state),
        canvas,
        liveFocusRow(state.selectionRows.focus, simDays),
        simDays,
        state.subsystems.earthTiles?.getDebugSnapshot().subCamera ?? null,
      );
    },
    applySwapFormat: (desired) => applySwapFormat(state, desired),
  };
}
