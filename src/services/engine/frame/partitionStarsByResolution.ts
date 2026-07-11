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

import type { StarBody } from '../../../@types/scene/StarBody';
import type { Vec3 } from '../../../@types/math/Vec3';
import { SCALE_UNITS } from '../../../data/scaleUnits';
import { apparentSizePx } from '../../../utils/math/apparentSizePx';
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
 * The Sun's seed id (`sceneBodies.ts`). The Sun is `alwaysResolved`: it has
 * no meaningful "far point" presentation at the scales we ship, and with
 * the camera parked on it (distance 0) `apparentSizePx`'s divide-by-zero
 * guard returns 0 — the override is what keeps the Sun a sphere exactly
 * where a size test would drop it.
 */
const SUN_ID = 'sun';

/**
 * Split `stars` into the resolved (`spheres`) and unresolved (`points`)
 * partitions for the current camera. Seed order is preserved within each
 * branch, and the returned arrays reference the input records (no copies) —
 * the sphere layer composes MVPs straight off `positionMpc`.
 */
export function partitionStarsByResolution(input: {
  stars: readonly StarBody[];
  camPosMpc: Readonly<Vec3>;
  thresholdPx: number;
  viewportHeightPx: number;
  fovYRad: number;
}): { spheres: readonly StarBody[]; points: readonly StarBody[] } {
  const { stars, camPosMpc, thresholdPx, viewportHeightPx, fovYRad } = input;
  const spheres: StarBody[] = [];
  const points: StarBody[] = [];
  for (const star of stars) {
    const dx = star.positionMpc[0] - camPosMpc[0];
    const dy = star.positionMpc[1] - camPosMpc[1];
    const dz = star.positionMpc[2] - camPosMpc[2];
    const distanceMpc = Math.hypot(dx, dy, dz);
    // The star's physical diameter in kpc: radiusKm·2 → Mpc → kpc, every
    // step through a named SCALE_UNITS constant (no inline magic factors).
    const diameterKpc = (star.radiusKm * 2 * SCALE_UNITS.KM_TO_MPC) / SCALE_UNITS.KPC_TO_MPC;
    const resolved = resolvesToSphere({
      apparentSizePx: apparentSizePx({ diameterKpc, distanceMpc, viewportHeightPx, fovYRad }),
      thresholdPx,
      alwaysResolved: star.id === SUN_ID,
    });
    (resolved ? spheres : points).push(star);
  }
  return { spheres, points };
}
