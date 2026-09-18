/**
 * rotationSurfaceLocked — orientation for a body standing on a host's surface:
 * +Z is the ground's up, +X the heading, measured from local north toward local
 * east. `groundUpEnu` is that up in the radial (east, north, up) frame, so flat
 * ground is [0, 0, 1]; `hostPoleWorld` is the host orientation's third column.
 */

import type { Mat3 } from '../../@types/math/Mat3';
import type { Vec3 } from '../../@types/math/Vec3';
import { cross3 } from '../math/cross3';
import { projectOntoPlane3 } from '../math/projectOntoPlane3';
import { degToRad } from '../math/degToRad';
import { mat3FromColumns } from '../math/mat3FromColumns';
import { normalize3 } from '../math/normalize3';

export function rotationSurfaceLocked(
  bodyPosMpc: Readonly<Vec3>,
  hostPosMpc: Readonly<Vec3>,
  hostPoleWorld: Readonly<Vec3>,
  headingDeg: number,
  groundUpEnu: Readonly<Vec3>,
): Mat3 {
  // Radial from the already-derived position rather than a second copy of the
  // site's lat/lon, so the two can never drift apart.
  const radial = normalize3([
    bodyPosMpc[0] - hostPosMpc[0],
    bodyPosMpc[1] - hostPosMpc[1],
    bodyPosMpc[2] - hostPosMpc[2],
  ]);
  const radialNorth = normalize3(projectOntoPlane3(hostPoleWorld, radial));
  const radialEast = cross3(radialNorth, radial);
  const [e, n, u] = groundUpEnu;
  const up = normalize3([
    radialEast[0] * e + radialNorth[0] * n + radial[0] * u,
    radialEast[1] * e + radialNorth[1] * n + radial[1] * u,
    radialEast[2] * e + radialNorth[2] * n + radial[2] * u,
  ]);

  // North re-derived around the ground's up rather than tilted with it, so the
  // heading stays an azimuth from north on a slope.
  const north = normalize3(projectOntoPlane3(hostPoleWorld, up));
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
