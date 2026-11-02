/**
 * buildDemandCtx — snapshots the read surfaces a demand predicate may consult
 * into a single `DemandCtx` (per-surface rationale: `@types/loading/DemandCtx.d.ts`).
 */

import { assembleOrbitCamera } from '../camera/assembleOrbitCamera';
import { liveWorldPose } from '../helpers/liveWorldPose';
import { ORIENTATION_FRAMES } from '../../../data/orientation/orientationFrames';

import type { DemandCtx } from '../../../@types/loading/DemandCtx';
import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { AssetKey } from '../../../@types/loading/AssetKey';
import type { LoadState } from '../../../@types/loading/LoadState';

export function buildDemandCtx(state: EngineState): DemandCtx {
  return {
    settings: state.settings,
    ui: state.ui,
    slotState: (k: AssetKey): LoadState<unknown>['kind'] =>
      state.slotsByKey.get(k)?.state().kind ?? 'idle',
    // Previous frame's DISPLAYED world eye, in Mpc, via the same `assembleOrbitCamera`
    // call shape as `drawCamPos`; a read at rest, so the steady orientation frame.
    cameraPosMpc: assembleOrbitCamera(
      liveWorldPose(state),
      state.cameraRuntime.outputs.projection,
      ORIENTATION_FRAMES[state.settings.orientation],
      ORIENTATION_FRAMES[state.settings.orientation],
    ).position,
    // The instant the last frame derived its bodies at, so demand-time body
    // positions match the frame that drew them.
    simDays: state.cameraRuntime.outputs.simDays,
    tier: state.tier,
    selectedKinds: new Set(
      [state.selection.select, state.selection.focus].flatMap((ref) => (ref ? [ref.type] : [])),
    ),
  };
}
