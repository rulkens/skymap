import type { StarCutFrustum } from '../../@types/rendering/StarCutFrustum';
import { frustumPlanesFromViewProj } from '../camera/frustumPlanesFromViewProj';
import {
  STAR_SIZE_REF_PX,
  STAR_GLOW_MIN_PX,
  STAR_PICK_MIN_RADIUS_PX,
} from '../../data/starCullSlack';
import { SCALE_UNITS } from '../../data/scaleUnits';

const cutPlanesMpcScratch = new Float32Array(24);
const cutPlanesPcScratch = new Float64Array(24);
// Inferred-mutable so the two margins can be rewritten each frame.
const cutFrustumScratch = {
  planesPc: cutPlanesPcScratch,
  angularMarginRad: 0,
  worldSpread: 1,
};

/**
 * This frame's WALK off-screen-prune frustum, from the already-rebased NEAR0
 * vp — the exact matrix the star draws clip against, so the coarse prune
 * agrees with what the GPU would keep. `rebasedVp === null` (no resolvable
 * NEAR0 slab — a hand-built test context) returns `null`, and
 * `walkStarOctreeCut` falls back to its full, un-pruned walk.
 *
 * THE PICK-SLACK FLOOR: the returned slack is sized to the WIDEST downstream
 * footprint so this coarse prune can never wrong-drop a node an exact
 * per-node cull would still paint. The pick pass recomputes this SAME cut and
 * floors every leaf to the `STAR_PICK_MIN_RADIUS_PX` (3.5px) clickable
 * radius — bigger than the plain visual glow — so a false cull here would
 * make an edge star unclickable; `angularMarginRad` is sized to that pick
 * floor, not the smaller visual one. `worldSpread` covers an aggregate's glow
 * spread by the dot-size/overlap scale instead (a world, not angular, slack).
 */
export function buildStarCutFrustum(
  rebasedVp: Float32Array | null,
  fovYRad: number,
  canvasHeightPx: number,
  sizePx: number,
  glowOverlap: number,
): StarCutFrustum | null {
  if (rebasedVp === null) return null;
  const planesMpc = frustumPlanesFromViewProj(rebasedVp, cutPlanesMpcScratch);
  // A plane test `n·p_mpc + d ≥ 0` with `p_mpc = p_pc · PC_TO_MPC` divides
  // through by `PC_TO_MPC`: unit normals carry over, only `d` rescales.
  for (let b = 0; b < 24; b += 4) {
    cutPlanesPcScratch[b] = planesMpc[b]!;
    cutPlanesPcScratch[b + 1] = planesMpc[b + 1]!;
    cutPlanesPcScratch[b + 2] = planesMpc[b + 2]!;
    cutPlanesPcScratch[b + 3] = planesMpc[b + 3]! * SCALE_UNITS.MPC_TO_PC;
  }
  const sizeScale = sizePx / STAR_SIZE_REF_PX;
  const radiansPerPx = fovYRad / canvasHeightPx;
  const leafPxRadius = STAR_GLOW_MIN_PX * sizeScale;
  cutFrustumScratch.angularMarginRad =
    Math.max(leafPxRadius, STAR_PICK_MIN_RADIUS_PX) * radiansPerPx;
  cutFrustumScratch.worldSpread = Math.max(1, sizeScale * glowOverlap);
  return cutFrustumScratch;
}
