/**
 * aboveRingAnchor — the point a label hangs from when it sits just above a
 * camera-facing ring: the ring centre, lifted along `up` (see `ringUpDirection`)
 * by the ring radius plus a clearance gap.
 *
 * The lift is a direction times a length, so it adds identically to absolute
 * and camera-relative centres.
 */

import type { Vec3 } from '../../@types/math/Vec3';

export function aboveRingAnchor(
  centre: Readonly<Vec3>,
  up: Readonly<Vec3>,
  radiusMpc: number,
  gapMpc: number,
): Vec3 {
  const lift = radiusMpc + gapMpc;
  return [centre[0] + up[0] * lift, centre[1] + up[1] * lift, centre[2] + up[2] * lift];
}
