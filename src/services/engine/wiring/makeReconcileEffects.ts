/**
 * makeReconcileEffects — factory that binds engine-side closures into the
 * ReconcileEffects surface the saga context exposes to the store layer.
 *
 * Each closure here mirrors the corresponding body that lives in the per-setter
 * handles (setMilkyWayEnabled, setFlow, setBiasMode) — relocated from those
 * per-setter homes into one effects factory so all reactive engine consequences
 * of settings Intent share a single registration point. That is the
 * intent.md §5 "effects in one home" direction: sagas drive Intent; this
 * factory provides the engine callbacks sagas call after dispatching.
 *
 * The six effects:
 *   requestRender — wakes the render-on-demand scheduler (mirrors every setter
 *                   that calls state.subsystems.scheduler.requestRender()).
 *   syncFades     — delegates to syncVisibilityFades with animate: true and the
 *                   caller-supplied row set (mirrors setMilkyWayEnabled's and
 *                   setFlow's syncVisibilityFades call).
 *   reseedFlow    — reseeds the flow particle field; tolerates a null renderer
 *                   via optional chaining (mirrors setFlow's maybeReseed call).
 *   bakeBias      — kicks the bias-correction worker bake via fire-and-forget;
 *                   the `void` discards the Promise, matching setBiasMode's
 *                   intent not to await (mirrors setBiasMode's setMode call).
 *   captureScene  — wraps captureScene(state): snapshots settings clusters + focus
 *                   so the tour can rewind to the pre-beat state on restore.
 *   restoreScene  — wraps restoreScene(state, store, ...): replays the captured
 *                   snapshot through the same dispatch surface production actions
 *                   use, keeping the store coherent.
 */

import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { ReconcileEffects } from '../../../store/effects/ReconcileEffects';
import type { AppStore } from '../../../store/types';
import { syncVisibilityFades } from './syncVisibilityFades';
import { captureScene } from './captureScene';
import { restoreScene } from './restoreScene';

export function makeReconcileEffects(state: EngineState, store: AppStore): ReconcileEffects {
  return {
    requestRender: () => state.subsystems.scheduler.requestRender(),
    syncFades: (rows) => syncVisibilityFades(state, { animate: true, only: rows }),
    reseedFlow: () => state.gpu.flowFieldRenderer?.maybeReseed(),
    bakeBias: (mode) => void state.subsystems.biasCorrection.setMode(mode),
    captureScene: () => captureScene(state),
    restoreScene: (snapshot, opts) => restoreScene(state, store, snapshot, opts),
  };
}
