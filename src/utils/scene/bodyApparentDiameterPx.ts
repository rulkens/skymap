/**
 * bodyApparentDiameterPx — project a scene body's physical diameter into
 * on-screen pixels at the current camera distance.
 *
 * This is the ONE place the "body record → apparent pixel size" composition
 * lives: the three LOD gates that decide a body's presentation each frame — the
 * star point↔sphere split (`partitionStarsByResolution`), the planet sub-pixel
 * cull (`planetsLayer`), and the body glint↔mesh split
 * (`partitionBodiesByPresentation`) — all read the same physical size the same
 * way. Before this helper each site re-spelled the identical
 * `hypot → diameterKm→kpc → apparentSizePx` block; a fix to any of them (a unit
 * factor, a degenerate guard) had to be mirrored across three copies or they
 * would silently disagree about which bodies are sub-pixel.
 *
 * ### The distance-0 case returns Infinity, not 0
 *
 * A camera sitting exactly ON a body (distance 0) is INSIDE it — maximally
 * resolved, never sub-pixel. But `apparentSizePx`'s divide-by-zero guard returns
 * 0 there, which a bare `size >= threshold` test would read as sub-pixel and
 * demote the body the camera is inside. Returning `Infinity` at distance 0 lets
 * every caller keep a plain `>= threshold` comparison and get the right answer
 * with no per-site degenerate branch: Infinity clears any finite threshold, so
 * the body resolves. That folds the three copies of the distance-0 special case
 * into this one boundary.
 */

import type { Vec3 } from '../../@types/math/Vec3';
import { SCALE_UNITS } from '../../data/scaleUnits';
import { apparentSizePx } from '../math/apparentSizePx';

export function bodyApparentDiameterPx(input: {
  positionMpc: Readonly<Vec3>;
  radiusM: number;
  camPosMpc: Readonly<Vec3>;
  viewportHeightPx: number;
  fovYRad: number;
}): number {
  const { positionMpc, radiusM, camPosMpc, viewportHeightPx, fovYRad } = input;
  const dx = positionMpc[0] - camPosMpc[0];
  const dy = positionMpc[1] - camPosMpc[1];
  const dz = positionMpc[2] - camPosMpc[2];
  const distanceMpc = Math.hypot(dx, dy, dz);
  // Camera inside the body — maximally resolved, so hand every threshold a value
  // that clears it (see the docblock). This is the single home for what used to
  // be three copies of the distance-0 guard.
  if (distanceMpc <= 0) return Infinity;
  // Physical diameter in kpc: radiusM·2 → Mpc → kpc, every step through a named
  // SCALE_UNITS constant (no inline magic factors).
  const diameterKpc = (radiusM * 2 * SCALE_UNITS.M_TO_MPC) / SCALE_UNITS.KPC_TO_MPC;
  return apparentSizePx({ diameterKpc, distanceMpc, viewportHeightPx, fovYRad });
}
