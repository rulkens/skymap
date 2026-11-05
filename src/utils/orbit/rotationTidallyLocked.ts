/**
 * rotationTidallyLocked — orientation for a synchronous moon: +Z is the IAU pole,
 * +X (longitude 0) points at the host, +Y completes the right-handed triad. The
 * host direction is taken from the orbit rather than from IAU W because the IAU
 * W rows and the JPL orbit rows disagree in phase and rate, so a W-driven moon
 * turns away from its planet. Optical libration is dropped.
 */

import type { Mat3 } from '../../@types/math/Mat3';
import type { Vec3 } from '../../@types/math/Vec3';
import { cross3 } from '../math/cross3';
import { degToRad } from '../math/degToRad';
import { dot3 } from '../math/dot3';
import { mat3FromColumns } from '../math/mat3FromColumns';
import { normalize3 } from '../math/normalize3';

export function rotationTidallyLocked(
  bodyPosMpc: Readonly<Vec3>,
  hostPosMpc: Readonly<Vec3>,
  poleRaDeg: number,
  poleDecDeg: number,
): Mat3 {
  const ra = degToRad(poleRaDeg);
  const dec = degToRad(poleDecDeg);
  const pole: Vec3 = [Math.cos(dec) * Math.cos(ra), Math.cos(dec) * Math.sin(ra), Math.sin(dec)];
  const toHost = normalize3([
    hostPosMpc[0] - bodyPosMpc[0],
    hostPosMpc[1] - bodyPosMpc[1],
    hostPosMpc[2] - bodyPosMpc[2],
  ]);
  const d = dot3(toHost, pole);
  const x = normalize3([toHost[0] - d * pole[0], toHost[1] - d * pole[1], toHost[2] - d * pole[2]]);
  return mat3FromColumns(x, cross3(pole, x), pole);
}
