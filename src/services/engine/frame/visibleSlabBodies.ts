import type { BodyState } from '../../../@types/scene/BodyState';
import type { SceneBody } from '../../../@types/scene/SceneBody';
import type { Vec3 } from '../../../@types/math/Vec3';
import { bodyApparentDiameterPx } from '../../../utils/scene/bodyApparentDiameterPx';
import { bodyDrawRadiusM } from '../../../utils/scene/bodyDrawRadiusM';
import { PROXY_SCALE } from '../../../utils/scene/proxyScale';
import { SCALE_UNITS } from '../../../data/scaleUnits';
import { SUB_PIXEL_BODY_CULL_PX } from './subPixelBodyCullPx';

/**
 * visibleSlabBodies — which of `bodies` get a body slab row this frame:
 * apparent diameter clears `SUB_PIXEL_BODY_CULL_PX` (spec §4) AND the body's
 * angular disc reaches inside the view frustum — off-axis angle minus
 * angular radius, vs. the frustum half-diagonal, never a projected-CENTRE
 * test (`saturn-vanish-investigation.md` Phase 2: centre/clip-axis confusion
 * is exactly the bug class this avoids). Both culls key on the SAME `rEffM`
 * (mirrors `slabs.ts`'s `marginM`: the larger of the PROXY_SCALE-inflated
 * proxy or an un-inflated wider shell/rings/atmosphere) — a ring can clear
 * the pixel floor while the bare globe doesn't, and this roster gate runs
 * upstream of any per-layer gate that might otherwise still draw it (radar
 * frame finding 2). A missing `bodyStates` entry is dropped, not thrown
 * (feeds a slab COUNT the frame program pool-sizes from, spec §6). The
 * candidate list is the caller's to assemble — this gate treats every
 * `SceneBody` union arm identically, culling on its shared `radiusM`/`id`.
 */
export function visibleSlabBodies(input: {
  readonly bodies: readonly SceneBody[];
  readonly bodyStates: ReadonlyMap<string, BodyState>;
  readonly camPosMpc: Readonly<Vec3>;
  readonly camForwardMpc: Readonly<Vec3>;
  readonly viewportWidthPx: number;
  readonly viewportHeightPx: number;
  readonly fovYRad: number;
}): readonly SceneBody[] {
  const {
    bodies: candidates,
    bodyStates,
    camPosMpc,
    camForwardMpc,
    viewportWidthPx,
    viewportHeightPx,
    fovYRad,
  } = input;

  // Half-diagonal (corner, not edge — the widest off-axis angle a fully
  // on-screen body can have), padded by FRUSTUM_CULL_MARGIN_FACTOR: this is
  // a perf cull, so a missed cull costs a pass but a false cull vanishes a
  // visible body — the margin leans toward keeping.
  const aspect = viewportWidthPx / viewportHeightPx;
  const halfDiagRad = Math.atan(Math.tan(fovYRad / 2) * Math.hypot(1, aspect));
  const cullThresholdRad = halfDiagRad * FRUSTUM_CULL_MARGIN_FACTOR;

  return candidates.filter((body) => {
    const state = bodyStates.get(body.id);
    if (state === undefined) return false;

    // The widest thing this row can draw — the same value the frustum cull
    // below needs, so both culls agree on the body's footprint (radar frame
    // finding 2: they used to disagree, body.radiusM here vs. this same
    // ring/atmosphere-inclusive max there).
    const rEffM = Math.max(PROXY_SCALE * body.radiusM, bodyDrawRadiusM(body));

    const diameterPx = bodyApparentDiameterPx({
      positionMpc: state.positionMpc,
      radiusM: rEffM,
      camPosMpc,
      viewportHeightPx,
      fovYRad,
    });
    if (diameterPx < SUB_PIXEL_BODY_CULL_PX) return false;

    return isInsideFrustum({ state, camPosMpc, camForwardMpc, cullThresholdRad, rEffM });
  });
}

const FRUSTUM_CULL_MARGIN_FACTOR = 1.15;

function isInsideFrustum(input: {
  readonly state: BodyState;
  readonly camPosMpc: Readonly<Vec3>;
  readonly camForwardMpc: Readonly<Vec3>;
  readonly cullThresholdRad: number;
  readonly rEffM: number;
}): boolean {
  const { state, camPosMpc, camForwardMpc, cullThresholdRad, rEffM } = input;
  const dx = state.positionMpc[0] - camPosMpc[0];
  const dy = state.positionMpc[1] - camPosMpc[1];
  const dz = state.positionMpc[2] - camPosMpc[2];
  const distanceMpc = Math.hypot(dx, dy, dz);

  const rEffMpc = rEffM * SCALE_UNITS.M_TO_MPC;
  // Camera at/inside the outermost shell (incl. distanceMpc <= 0, since
  // rEffMpc > 0): no off-axis angle is well-defined and the shell surrounds
  // every look direction, so never cull — mirrors bodyApparentDiameterPx's
  // distance-0 "maximally resolved" guard.
  if (rEffMpc >= distanceMpc) return true;

  const cosOffAxis =
    (dx * camForwardMpc[0] + dy * camForwardMpc[1] + dz * camForwardMpc[2]) / distanceMpc;
  const offAxisRad = Math.acos(Math.min(1, Math.max(-1, cosOffAxis)));
  const angularRadiusRad = Math.asin(rEffMpc / distanceMpc);

  return offAxisRad - angularRadiusRad <= cullThresholdRad;
}
