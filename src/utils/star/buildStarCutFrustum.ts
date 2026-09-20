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
// Inferred-mutable (no `StarCutFrustum` annotation) so the two margins can be
// rewritten each frame; a mutable object is still assignable to the readonly
// `StarCutFrustum` parameter.
const cutFrustumScratch = {
  planesPc: cutPlanesPcScratch,
  angularMarginRad: 0,
  worldSpread: 1,
};

/**
 * Build this frame's WALK off-screen-prune frustum from the already-rebased
 * NEAR0 vp (the exact matrix the star draws clip against, so the coarse prune
 * agrees with what the GPU would keep). `rebasedVp === null` means the caller
 * could not resolve a NEAR0 slab (a hand-built test context — a real frame
 * always has one): returns `null`, and `walkStarOctreeCut` falls back to the
 * full un-pruned walk, unchanged from before this cull existed.
 *
 * Returns the reused `cutFrustumScratch`; its planes are rescaled from
 * scene-Mpc into the parsec frame the walk's box math lives in, and its slack
 * is sized to the WIDEST downstream footprint so the prune can never
 * wrong-drop a node the exact per-node renderer cull would still paint:
 *   - leaves spill an angular amount (fixed-pixel dot), sized to the PICK 3.5px
 *     clickable floor (≥ the visual glow) because the pick pass recomputes the
 *     SAME cut and a clickable edge star must survive — mirrors `starCullMargins`;
 *   - aggregates spread their glow by the dot-size/overlap scale (world slack).
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
  // through by `PC_TO_MPC` to `n·p_pc + d·MPC_TO_PC ≥ 0`: unit normals carry
  // over, only the distance term rescales into parsecs.
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
