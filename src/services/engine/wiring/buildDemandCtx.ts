/**
 * buildDemandCtx — snapshots what `evaluateAssetDemand` reads into one `DemandCtx`
 * per pass (per-surface rationale: `@types/loading/DemandCtx.d.ts`).
 */

import { assembleOrbitCamera } from '../camera/assembleOrbitCamera';
import { liveWorldPose } from '../helpers/liveWorldPose';
import { ORIENTATION_FRAMES } from '../../../data/orientation/orientationFrames';

import type { DemandCtx } from '../../../@types/loading/DemandCtx';
import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { AssetKey } from '../../../@types/loading/AssetKey';
import type { LoadState } from '../../../@types/loading/LoadState';

export function buildDemandCtx(state: EngineState): DemandCtx {
  const { select, focus, pending } = state.selection;
  // A pending id's kind counts before its data loads, or a deep link to a catalog that only
  // loads when selected would wait on itself forever.
  const claimedKinds = (id: string | null) =>
    id === null
      ? []
      : state.selectionKindRows.filter((r) => r.focusId?.claims(id)).map((r) => r.type);
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
    drawPxPerRad: state.drawPxPerRad,
    tier: state.tier,
    selectedKinds: new Set([
      ...[select, focus].flatMap((ref) => (ref ? [ref.type] : [])),
      ...claimedKinds(pending.focus),
      ...claimedKinds(pending.select),
    ]),
  };
}
