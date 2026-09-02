/**
 * blendedEnuAt — east/north at `localUp` for the band-blended reference up:
 * the horizontal-plane reading of `blendedUpDir` (ruling 10's ONE field —
 * weight, blend, and hold-and-transport all live there). At `w = 1` this IS
 * `headingTiltAt`'s construction, fallback included. The engaged settle and
 * the camera debug readout both read THIS.
 */

import type { Vec3 } from '../../@types/math/Vec3';
import { blendedUpDir } from './blendedUpDir';
import { cross3 } from '../math/cross3';

const BODY_POLE: Vec3 = [0, 0, 1];

export function blendedEnuAt(
  localUp: Readonly<Vec3>,
  blendW: number,
  sceneUpLocal: Readonly<Vec3>,
  carryUp: Readonly<Vec3> | null,
): { readonly east: Vec3; readonly north: Vec3 } {
  const north = blendedUpDir(localUp, BODY_POLE, blendW, sceneUpLocal, carryUp);
  if (north !== null) return { east: cross3(north, localUp), north };
  // Degenerate with nothing to carry (a polar standpoint's vanished
  // horizontals): the classic pole-ENU fallback, byte-for-byte
  // `headingTiltAt`'s — load-bearing for every polar fixture.
  const eastRaw = cross3(BODY_POLE, localUp);
  const eastLen = Math.hypot(...eastRaw);
  const east: Vec3 =
    eastLen > 1e-9 ? [eastRaw[0] / eastLen, eastRaw[1] / eastLen, eastRaw[2] / eastLen] : [1, 0, 0];
  return { east, north: cross3(localUp, east) };
}
