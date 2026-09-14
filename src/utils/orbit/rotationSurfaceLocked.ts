/**
 * rotationSurfaceLocked — orientation for a body standing on a host's surface:
 * +Z is the local up, +X the heading, measured from local north toward local
 * east. The triad is derived from the body's already-derived position rather
 * than from a second copy of its lat/lon, so the two can never drift apart.
 * `hostPoleWorld` is the third column of the host's own orientation — which
 * `rotationFromIau` documents as the pole direction.
 */

import type { Mat3 } from '../../@types/math/Mat3';
import type { Vec3 } from '../../@types/math/Vec3';
import { cross3 } from '../math/cross3';
import { dot3 } from '../math/dot3';
import { degToRad } from '../math/degToRad';
import { mat3FromColumns } from '../math/mat3FromColumns';
import { normalize3 } from '../math/normalize3';

export function rotationSurfaceLocked(
  bodyPosMpc: Readonly<Vec3>,
  hostPosMpc: Readonly<Vec3>,
  hostPoleWorld: Readonly<Vec3>,
  headingDeg: number,
): Mat3 {
  const up = normalize3([
    bodyPosMpc[0] - hostPosMpc[0],
    bodyPosMpc[1] - hostPosMpc[1],
    bodyPosMpc[2] - hostPosMpc[2],
  ]);

  // The host's spin axis flattened onto the local horizon is local north; east
  // then completes a right-handed (east, north, up) frame.
  const poleUp = dot3(hostPoleWorld, up);
  const north = normalize3([
    hostPoleWorld[0] - poleUp * up[0],
    hostPoleWorld[1] - poleUp * up[1],
    hostPoleWorld[2] - poleUp * up[2],
  ]);
  const east = cross3(north, up);

  const heading = degToRad(headingDeg);
  const cosH = Math.cos(heading);
  const sinH = Math.sin(heading);
  const forward: Vec3 = [
    north[0] * cosH + east[0] * sinH,
    north[1] * cosH + east[1] * sinH,
    north[2] * cosH + east[2] * sinH,
  ];

  return mat3FromColumns(forward, cross3(up, forward), up);
}
