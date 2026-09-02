/**
 * refAzimuthOf — the user-visible azimuth of a view against a reference ENU:
 * read off screen-up below 45° tilt and off forward above — their horizontal
 * parts are cos(tilt) and sin(tilt) long, so they trade places there. For a
 * roll-free pose the two agree; while a roll is still bleeding out the chosen
 * one is what the user means by "north is up". ONE home for the source rule —
 * the engaged settle and the camera debug readout both call THIS.
 */

import type { Vec3 } from '../../@types/math/Vec3';

function dot3(a: Readonly<Vec3>, b: Readonly<Vec3>): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

export function refAzimuthOf(
  localUp: Readonly<Vec3>,
  forward: Readonly<Vec3>,
  up: Readonly<Vec3>,
  east: Readonly<Vec3>,
  north: Readonly<Vec3>,
): number {
  const source = dot3(forward, localUp) < -Math.SQRT1_2 ? up : forward;
  const vert = dot3(source, localUp);
  const horiz: Vec3 = [
    source[0] - localUp[0] * vert,
    source[1] - localUp[1] * vert,
    source[2] - localUp[2] * vert,
  ];
  return Math.atan2(dot3(horiz, east), dot3(horiz, north));
}
