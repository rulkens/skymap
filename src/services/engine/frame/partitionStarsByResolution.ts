/**
 * partitionStarsByResolution — the ONE branch point deciding which star
 * layer draws each seeded star this frame.
 *
 * `starSpheresLayer` draws the `spheres` branch (true-scale emissive
 * spheres in the depth-bearing foreground); `starPointsLayer` draws the
 * `points` branch (additive billboards in the HDR accumulation). Both
 * layers call THIS function and consume opposite branches of one result,
 * so a star is a sphere XOR a point **by construction**: every star lands
 * in exactly one of the two arrays (disjoint) and no star is dropped
 * (exhaustive). That structural invariant — one partition consumed twice,
 * rather than two per-layer gates that could drift apart — is the root of
 * the smooth point→sphere promotion: there is no frame in which a star can
 * double-draw or vanish at the threshold crossing.
 *
 * The per-star decision is the same apparent-size mechanism galaxies use
 * for their point→thumbnail promotion (`apparentSizePx` feeding a pixel
 * threshold — see `produceFamousLabels.ts`): project the star's physical
 * diameter at its camera distance into pixels, then let `resolvesToSphere`
 * apply the threshold. The function stays pure — a function of the star
 * list, the camera position, and the projection parameters — so the split
 * unit-tests headlessly, with no GPU device or engine state to stand up.
 */

import type { PositionedStar } from '../../../@types/scene/PositionedStar';
import type { Vec3 } from '../../../@types/math/Vec3';
import { bodyApparentDiameterPx } from '../../../utils/scene/bodyApparentDiameterPx';
import { resolvesToSphere } from '../../../utils/scene/resolvesToSphere';

/**
 * Apparent-size threshold (px) at which a star promotes from an additive
 * backdrop point to a resolved foreground sphere.
 *
 * Same promotion mechanism as the famous-galaxy gate
 * (`FAMOUS_MIN_APPARENT_PX = 6` in `produceFamousLabels.ts`, which holds
 * back a galaxy's label/thumbnail until its apparent size clears 6 px).
 * Stars promote a little earlier (4 px) because their handoff swaps a soft
 * point sprite for a sphere of the same emissive colour — near-seamless at
 * a few pixels — whereas the famous gate is admitting a caption that must
 * not flicker in at sub-legible sizes. ONE constant, exported from this
 * module and imported by both star layers — never a duplicated literal.
 */
export const STAR_RESOLVE_PX = 4;

/**
 * Split `stars` into the resolved (`spheres`) and unresolved (`points`)
 * partitions for the current camera. Seed order is preserved within each
 * branch, and the returned arrays reference the input records (no copies) —
 * the sphere layer composes MVPs straight off `positionMpc`, which
 * `positionedVisibleStars` resolved for this frame.
 *
 * EVERY star — the Sun included — rides the same apparent-size predicate: a
 * star whose sphere is sub-pixel demotes to an additive point, so it stays
 * visible from any distance inside the foreground gate. (A blanket
 * always-resolve-the-Sun override was tried first and made the Sun VANISH
 * beyond ~tens of AU — never a point, its sphere sub-pixel.) The one narrow
 * guard kept from that override is the degenerate camera-ON-the-star case: a
 * star the camera sits inside must resolve, not demote. That case is owned by
 * `bodyApparentDiameterPx`, which returns Infinity at distance 0 (rather than
 * the raw 0 the divide-by-zero guard emits), so it clears any threshold and
 * `alwaysResolved` stays false here — no per-star special case.
 */
export function partitionStarsByResolution(input: {
  stars: readonly PositionedStar[];
  camPosMpc: Readonly<Vec3>;
  thresholdPx: number;
  viewportHeightPx: number;
  fovYRad: number;
}): { spheres: readonly PositionedStar[]; points: readonly PositionedStar[] } {
  const { stars, camPosMpc, thresholdPx, viewportHeightPx, fovYRad } = input;
  const spheres: PositionedStar[] = [];
  const points: PositionedStar[] = [];
  for (const star of stars) {
    // Shared projection: apparent diameter in px, Infinity when the camera sits
    // inside the star. That degenerate case (the star the camera is inside must
    // resolve, not demote) is owned by `bodyApparentDiameterPx` — Infinity
    // clears any threshold — so `alwaysResolved` stays false and there is no
    // per-star special case here.
    const diameterPx = bodyApparentDiameterPx({
      positionMpc: star.positionMpc,
      radiusKm: star.radiusKm,
      camPosMpc,
      viewportHeightPx,
      fovYRad,
    });
    const resolved = resolvesToSphere({
      apparentSizePx: diameterPx,
      thresholdPx,
      alwaysResolved: false,
    });
    (resolved ? spheres : points).push(star);
  }
  return { spheres, points };
}
