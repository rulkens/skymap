/**
 * headingTiltAt — heading/tilt of a `forward`/`up` pair in the ENU at
 * `localUp`. Single home for the surface controller's tilt-ceiling
 * enforcement, which used to inline this byte-for-byte, including two
 * copies of the 0.08° nadir threshold.
 *
 * East is built off the radial vector, not lon/atan2 — stays finite at the
 * pole, where a lon-driven East would divide by the vanishing cos(lat).
 * Heading reads off `up` rather than `forward` within `NADIR_ESCAPE_SIN` of
 * nadir/zenith: forward's horizontal component vanishes there, so only `up`
 * still carries the azimuth (this is where heading absorbs roll, spec §12-R1).
 */

import type { HeadingTiltAt } from '../../@types/camera/HeadingTiltAt';
import type { Vec3 } from '../../@types/math/Vec3';
import { cross3 } from '../math/cross3';

const POLAR_AXIS: Vec3 = [0, 0, 1];
// sin(0.08°) — the horizontal-projection magnitude below which forward's
// azimuth is unstable (spec §14's nadir escape).
const NADIR_ESCAPE_SIN = Math.sin((0.08 * Math.PI) / 180);

function dot3(a: Readonly<Vec3>, b: Readonly<Vec3>): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

export function headingTiltAt(
  localUp: Readonly<Vec3>,
  forward: Readonly<Vec3>,
  up: Readonly<Vec3>,
): HeadingTiltAt {
  const eastRaw = cross3(POLAR_AXIS, localUp);
  const eastLen = Math.hypot(eastRaw[0], eastRaw[1], eastRaw[2]);
  const east: Vec3 =
    eastLen > 1e-9 ? [eastRaw[0] / eastLen, eastRaw[1] / eastLen, eastRaw[2] / eastLen] : [1, 0, 0];
  const north = cross3(localUp, east);

  const fwdVert = dot3(forward, localUp);
  const fwdHorizMag = Math.sqrt(Math.max(0, 1 - fwdVert * fwdVert));
  const headingSource = fwdHorizMag < NADIR_ESCAPE_SIN ? up : forward;
  const headingRad = Math.atan2(dot3(headingSource, east), dot3(headingSource, north));
  const tiltRad = Math.acos(Math.max(-1, Math.min(1, -fwdVert)));

  return { headingRad, tiltRad, east, north };
}
