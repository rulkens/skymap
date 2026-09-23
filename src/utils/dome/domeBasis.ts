/**
 * domeBasis — camera-from-dome rotation: dome axes (right, zenith, front)
 * expressed in camera coordinates, at tilt `tiltDeg`. The zenith is the
 * camera forward pitched up by `tiltDeg`; see the dome-fisheye plan's "Dome
 * frame" table for the derivation.
 */

import type { Mat3 } from '../../@types/math/Mat3';
import { mat3FromColumns } from '../math/mat3FromColumns';
import { degToRad } from '../math/degToRad';

export function domeBasis(tiltDeg: number): Mat3 {
  const tau = degToRad(tiltDeg);
  const s = Math.sin(tau);
  const c = Math.cos(tau);
  return mat3FromColumns([1, 0, 0], [0, s, c], [0, -c, s]);
}
