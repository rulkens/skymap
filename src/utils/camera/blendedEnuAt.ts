/**
 * blendedEnuAt — east/north at `localUp` for the band-blended reference up
 * (ruling 8, round 6): north is the normalized blend of the two references'
 * HORIZONTAL projections, `w·pole_h + (1−w)·sceneUp_h`. Any continuous
 * reference field between two fixed axes has a singular locus (here: where
 * the horizontals cancel, on the pole→sceneUp arc) — that is topology, not a
 * construction flaw — so the settle's RIDE BOUND owns the discontinuity; the
 * cancellation point itself falls back to the classic pole ENU. At `w = 1`
 * this IS `headingTiltAt`'s construction, fallback included. ONE home — the
 * engaged settle and the camera debug readout both read THIS, so the
 * instrument cannot drift from the mechanism.
 */

import type { Vec3 } from '../../@types/math/Vec3';
import { cross3 } from '../math/cross3';
import { normalize3 } from '../math/normalize3';

const BODY_POLE: Vec3 = [0, 0, 1];

function horizontalPart(v: Readonly<Vec3>, localUp: Readonly<Vec3>): Vec3 {
  const vert = v[0] * localUp[0] + v[1] * localUp[1] + v[2] * localUp[2];
  return [v[0] - localUp[0] * vert, v[1] - localUp[1] * vert, v[2] - localUp[2] * vert];
}

export function blendedEnuAt(
  localUp: Readonly<Vec3>,
  blendW: number,
  sceneUpLocal: Readonly<Vec3>,
): { readonly east: Vec3; readonly north: Vec3 } {
  const p = horizontalPart(BODY_POLE, localUp);
  const s = horizontalPart(sceneUpLocal, localUp);
  const raw: Vec3 = [
    blendW * p[0] + (1 - blendW) * s[0],
    blendW * p[1] + (1 - blendW) * s[1],
    blendW * p[2] + (1 - blendW) * s[2],
  ];
  if (Math.hypot(...raw) > 1e-9) {
    const north = normalize3(raw);
    return { east: cross3(north, localUp), north };
  }
  // Degenerate (standpoint at a reference's zenith, or the anti-parallel
  // knot): the classic pole-ENU fallback, byte-for-byte `headingTiltAt`'s.
  const eastRaw = cross3(BODY_POLE, localUp);
  const eastLen = Math.hypot(...eastRaw);
  const east: Vec3 =
    eastLen > 1e-9 ? [eastRaw[0] / eastLen, eastRaw[1] / eastLen, eastRaw[2] / eastLen] : [1, 0, 0];
  return { east, north: cross3(localUp, east) };
}
