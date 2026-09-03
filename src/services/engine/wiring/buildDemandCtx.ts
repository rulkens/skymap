/**
 * buildDemandCtx — snapshots the read surfaces a demand predicate may
 * consult into a single `DemandCtx` (see `@types/loading/DemandCtx.d.ts` for
 * the rationale behind each surface).
 *
 * ### Why a builder rather than passing `state` to predicates directly
 *
 * Predicates must be cheap to test and impossible to misuse. Handing them the
 * whole `EngineState` would let a predicate reach into unrelated bags (mutate
 * GPU handles, fire callbacks) and would couple every predicate test to the
 * full engine shape. `DemandCtx` is a narrow read-only facade: query
 * functions over the slices a load policy legitimately depends on. The builder
 * is the single place that maps `state` → those queries, so the mapping
 * (request-flag set, slot-state accessor) lives in one spot.
 *
 * ### Why built once per evaluation cycle, not memoised
 *
 * `reevaluateDemand` calls this once and shares the result across every row.
 * The closures capture `state` by reference, so reads are always live against
 * the current engine state — there's no stale snapshot. Rebuilding per row
 * would allocate fresh closures per row for no benefit.
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
    // `?? 'idle'` covers the not-yet-minted slot: an absent (null/undefined)
    // slot has never been asked to load, which is exactly what `idle` means.
    slotState: (k: AssetKey): LoadState<unknown>['kind'] =>
      slotFor(state, k)?.state().kind ?? 'idle',
    // The previous frame's DISPLAYED world eye position — the one proximity
    // read surface (see DemandCtx surface 4); the tilt projection preserves
    // the eye, so displayed vs authored is a distinction without a difference
    // here, and displayed keeps the rule "off-frame reads see the screen".
    // The pose boxes are constructed + placeholder-seeded in `engine.ts`, so
    // this is never null. Derived with the
    // SAME `assembleOrbitCamera(pose, projection, poseBasis, upBasis)` the frame
    // runs for `drawCamPos` (see frameContext.ts), so a proximity demand/release
    // predicate's demand-time read agrees byte-for-byte with the draw-time camera
    // — deriving it a second way here would risk the two silently diverging.
    // `.position` only ever decodes through `poseBasis`, so `upBasis` is a
    // don't-care here — passed the same steady value for symmetry with the draw
    // path's call shape, not because this read depends on it.
    // `.position` is a fresh writable tuple per call; widening it to
    // `Readonly<Vec3>` hands predicates a read-only view without a copy.
    //
    // Demand reevaluation runs between frames (and at the head of `runFrame`,
    // before this frame's produce step), reading the PREVIOUS frame's pose — a
    // read at rest. So the steady `ORIENTATION_FRAMES[orientation]` is the correct
    // basis: at rest the resolved per-frame basis equals the steady frame basis,
    // and an orientation tween is a transient the proximity gate is insensitive
    // to. (Task 9 owns the per-frame resolved basis on the draw path.)
    cameraPosMpc: assembleOrbitCamera(
      liveWorldPose(state),
      state.cameraRuntime.projection,
      ORIENTATION_FRAMES[state.settings.orientation],
      ORIENTATION_FRAMES[state.settings.orientation],
    ).position,
    // The instant the last frame derived its bodies at — the single-writer live
    // clock position (`runFrame` writes it just before produce). The body-texture
    // proximity gate derives host positions at this instant, exactly parallel to
    // reading `cameraPosMpc` from the last pose, so demand-time body positions
    // match the frame that drew them.
    simDays: state.cameraRuntime.lastRenderedSimDays.current,
  };
}
