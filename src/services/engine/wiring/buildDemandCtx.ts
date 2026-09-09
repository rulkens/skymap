/**
 * buildDemandCtx — snapshots the read surfaces a demand predicate may consult
 * into a single `DemandCtx` (per-surface rationale: `@types/loading/DemandCtx.d.ts`).
 */

import { slotFor } from './slotFor';
import { assembleOrbitCamera } from '../camera/assembleOrbitCamera';
import { liveWorldPose } from '../helpers/liveWorldPose';
import { ORIENTATION_FRAMES } from '../../../data/orientation/orientationFrames';

import type { DemandCtx } from '../../../@types/loading/DemandCtx';
import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { RequestKey } from '../../../@types/loading/RequestKey';
import type { AssetKey } from '../../../@types/loading/AssetKey';
import type { LoadState } from '../../../@types/loading/LoadState';

export function buildDemandCtx(state: EngineState): DemandCtx {
  return {
    settings: state.settings,
    request: (k: RequestKey) => state.requests.has(k),
    // An absent slot has never been asked to load — exactly what `idle` means.
    slotState: (k: AssetKey): LoadState<unknown>['kind'] =>
      slotFor(state, k)?.state().kind ?? 'idle',
    // Previous frame's DISPLAYED world eye, in Mpc, derived through the SAME
    // `assembleOrbitCamera` call shape the frame runs for `drawCamPos`, so a
    // proximity predicate's read agrees with the draw camera. Demand reevaluation
    // is a read at rest, so the steady orientation frame is the correct basis.
    cameraPosMpc: assembleOrbitCamera(
      liveWorldPose(state),
      state.cameraRuntime.projection,
      ORIENTATION_FRAMES[state.settings.orientation],
      ORIENTATION_FRAMES[state.settings.orientation],
    ).position,
    // The instant the last frame derived its bodies at, so demand-time body
    // positions match the frame that drew them.
    simDays: state.cameraRuntime.lastRenderedSimDays.current,
  };
}
