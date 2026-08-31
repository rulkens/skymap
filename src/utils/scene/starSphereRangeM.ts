import type { Vec3 } from '../../@types/math/Vec3';
import { SCALE_UNITS } from '../../data/scaleUnits';

/**
 * starSphereRangeM — the camera-distance interval, in metres, spanned by a
 * set of drawn star spheres: `[min(d−r), max(d+r)]` over `spheres`, or `null`
 * for an empty set. This is NEAR0's `distanceRangeM` (spec §7.1) — derived
 * from the spheres actually drawn this frame, not `foregroundFrustum`'s
 * bracket, so the row sorts correctly against body rows (the Sun can be
 * nearer OR farther than a resolved planet).
 *
 * `bodyRelativePose` is the body-slab path's sole Mpc↔metre site; this is the
 * one exception spec §7.1 carves for NEAR0's star-sphere interval — a Mpc
 * DISTANCE SCALAR, not a pose, folded to metres once here rather than
 * threading a body-relative pose through the star partition.
 */
export function starSphereRangeM(input: {
  readonly spheres: readonly { positionMpc: Readonly<Vec3>; radiusM: number }[];
  readonly camPosMpc: Readonly<Vec3>;
}): readonly [number, number] | null {
  const { spheres, camPosMpc } = input;
  if (spheres.length === 0) return null;

  let minM = Infinity;
  let maxM = -Infinity;
  for (const sphere of spheres) {
    const dMpc = Math.hypot(
      sphere.positionMpc[0] - camPosMpc[0],
      sphere.positionMpc[1] - camPosMpc[1],
      sphere.positionMpc[2] - camPosMpc[2],
    );
    const dM = dMpc * SCALE_UNITS.MPC_TO_M;
    minM = Math.min(minM, dM - sphere.radiusM);
    maxM = Math.max(maxM, dM + sphere.radiusM);
  }
  return [minM, maxM];
}
