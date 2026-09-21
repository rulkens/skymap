import type { StarCutFrustum } from '../../@types/rendering/StarCutFrustum';
import { frustumPlanesFromViewProj } from '../camera/frustumPlanesFromViewProj';
import { starCullMargins } from './starCullMargins';
import { STAR_SIZE_REF_PX } from '../../data/starCullSlack';
import { SCALE_UNITS } from '../../data/scaleUnits';

const cutPlanesMpcScratch = new Float32Array(24);
// Inferred-mutable so the margins and the grow-only plane buffer can be
// rewritten each frame.
const cutFrustumScratch = {
  planesPc: new Float64Array(24),
  viewCount: 0,
  angularMarginRad: 0,
  worldSpread: 1,
};

/**
 * This frame's WALK off-screen-prune frustum, from every view's already-rebased
 * NEAR0 vp — the exact matrices the star draws clip against, so the coarse
 * prune agrees with what the GPU would keep. A node survives if ANY view keeps
 * it. No vps (no resolvable NEAR0 slab — a hand-built test context) returns
 * `null`, and `walkStarOctreeCut` falls back to its full, un-pruned walk.
 *
 * `pxPerRad` is the rig's WIDEST view's (the SMALLEST `drawPxPerRad`): the
 * margin is monotonic in radians-per-pixel, so the widest view's slack covers
 * every other view's.
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
  rebasedVps: readonly Float32Array[],
  pxPerRad: number,
  sizePx: number,
  glowOverlap: number,
): StarCutFrustum | null {
  if (rebasedVps.length === 0) return null;
  // Grow-only: a capture/pick call carries one view, the rig N, every frame —
  // reallocating on every shrink back to one would thrash. `viewCount` (not
  // `planesPc.length`) tells the walk how much of the buffer is live.
  if (cutFrustumScratch.planesPc.length < 24 * rebasedVps.length) {
    cutFrustumScratch.planesPc = new Float64Array(24 * rebasedVps.length);
  }
  cutFrustumScratch.viewCount = rebasedVps.length;
  const planesPc = cutFrustumScratch.planesPc;
  rebasedVps.forEach((rebasedVp, v) => {
    const planesMpc = frustumPlanesFromViewProj(rebasedVp, cutPlanesMpcScratch);
    // A plane test `n·p_mpc + d ≥ 0` with `p_mpc = p_pc · PC_TO_MPC` divides
    // through by `PC_TO_MPC`: unit normals carry over, only `d` rescales.
    for (let b = 0; b < 24; b += 4) {
      planesPc[v * 24 + b] = planesMpc[b]!;
      planesPc[v * 24 + b + 1] = planesMpc[b + 1]!;
      planesPc[v * 24 + b + 2] = planesMpc[b + 2]!;
      planesPc[v * 24 + b + 3] = planesMpc[b + 3]! * SCALE_UNITS.MPC_TO_PC;
    }
  });
  // Pick, not leaf: this prune must never wrong-drop a node the pick pass
  // would still floor to the clickable radius (see the header's PICK-SLACK FLOOR).
  cutFrustumScratch.angularMarginRad = starCullMargins(sizePx, pxPerRad).pick;
  cutFrustumScratch.worldSpread = Math.max(1, (sizePx / STAR_SIZE_REF_PX) * glowOverlap);
  return cutFrustumScratch;
}
