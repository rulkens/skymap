/**
 * aboveRingAnchor — the point a label hangs from when it sits just above a
 * camera-facing ring: the ring centre, lifted by the ring radius plus a
 * clearance gap along screen-up taken into the ring's plane.
 *
 * The ring's plane is perpendicular to the sight line to its centre, not to the
 * camera's view axis, so screen-up only lies in that plane on the view axis.
 * Off-axis it dips into the ring; removing its sight-line component puts the
 * lift back in the plane. `sightLine` is the camera-to-centre vector, separate
 * from `centre` because `centre` may be in absolute coordinates.
 */

import type { Vec3 } from '../../@types/math/Vec3';
import { dot3 } from '../math/dot3';
import { normalize3 } from '../math/normalize3';

export function aboveRingAnchor(
  centre: Readonly<Vec3>,
  screenUp: Readonly<Vec3>,
  sightLine: Readonly<Vec3>,
  radiusMpc: number,
  gapMpc: number,
): Vec3 {
  const sight = normalize3(sightLine);
  const along = dot3(screenUp, sight);
  const up = normalize3([
    screenUp[0] - sight[0] * along,
    screenUp[1] - sight[1] * along,
    screenUp[2] - sight[2] * along,
  ]);
  const lift = radiusMpc + gapMpc;
  return [centre[0] + up[0] * lift, centre[1] + up[1] * lift, centre[2] + up[2] * lift];
}
