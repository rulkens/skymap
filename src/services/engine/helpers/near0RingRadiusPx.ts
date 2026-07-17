/**
 * near0RingRadiusPx — on-screen radius (pixels) of the NEAR0 selection halo
 * for a foreground target (a survey star, a planet, Earth, a scene star) of
 * physical radius `radiusMpc` viewed from `camDistMpc`.
 *
 * ## Why this exists alongside `selectionRingRadiusPx`
 *
 * The COSMO galaxy ring and this NEAR0 ring both want the same intuition —
 * far away the halo is a fixed-px affordance, up close it wraps the rendered
 * body instead of shrinking to a dot lost inside the sphere. But the two
 * targets bake DIFFERENT provenance into their apparent-size term, so they
 * cannot share one sizing:
 *
 *   - `selectionRingRadiusPx` sizes a galaxy BILLBOARD. Its `radiusMpc` input
 *     is the padded footprint the points pipeline draws (already 2×), it then
 *     halves that (`* 0.5`, to cancel the billboard's 4× padding) and finally
 *     applies a ×6 ring scale — a NET ×3 on the true apparent radius. That ×3
 *     is correct for a soft billboard glow but far too large for a hard sphere.
 *   - A NEAR0 body is drawn as an actual sphere of radius r that subtends
 *     `r / d` radians (see `bodyApparentDiameterPx` / `apparentSizePx`). Its
 *     ring should hug that sphere at a fixed 1.5× — enough breathing room to
 *     read as "this one" without ballooning.
 *
 * So this helper takes the TRUE apparent radius (`radiusMpc / camDist ·
 * pxPerRad`, no billboard-padding fudge) and scales it by 1.5.
 *
 * ## The far floor
 *
 * Down at parsec-to-AU distances the sphere is sub-pixel, and 1.5× of nothing
 * is nothing — the ring would vanish. The floor is EXACTLY the fixed-px ring
 * the galaxy helper produces for a zero-radius target: `selectionRingRadiusPx(
 * 0, …)` collapses to `pointSizePx · 6`, the same far-field 'still a legible
 * dot' minimum. Reusing the galaxy helper for the floor keeps that ×6 in ONE
 * place; far away nothing changes, and once the sphere resolves past the floor
 * the 1.5×-apparent term takes over and the ring meets the sphere.
 */

import { selectionRingRadiusPx } from './selectionRingRadiusPx';

// Multiplier from the target's TRUE apparent radius to the halo radius, once
// the resolved sphere is large enough to clear the far floor. Pinned at 1.5×:
// the ring sits just outside the sphere's silhouette — a "this one" affordance,
// not a billboard glow (which is why this is not the galaxy helper's ×3 net).
const NEAR0_RING_APPARENT_SCALE = 1.5;

export function near0RingRadiusPx(
  radiusMpc: number,
  camDistMpc: number,
  pxPerRad: number,
  pointSizePx: number,
): number {
  // Far floor = the galaxy ring's zero-radius size (`pointSizePx · 6`). Passing
  // radiusMpc 0 makes `selectionRingRadiusPx` ignore distance and return the
  // pure px floor, so the ×6 lives in exactly one place.
  const farFloorPx = selectionRingRadiusPx(0, camDistMpc, pxPerRad, pointSizePx);
  const safeDist = Math.max(camDistMpc, 0.001);
  // TRUE apparent radius of the sphere: r/d radians × px-per-rad. This matches
  // how the body is actually drawn (`bodyApparentDiameterPx`) — no billboard
  // padding — so the ring meets the sphere at the resolve handoff.
  const apparentRadiusPx = (radiusMpc / safeDist) * pxPerRad;
  return Math.max(farFloorPx, NEAR0_RING_APPARENT_SCALE * apparentRadiusPx);
}
