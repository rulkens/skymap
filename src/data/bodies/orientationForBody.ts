/**
 * orientationForBody — bake a scene body's local → equatorial-world rotation
 * from its id. A body with no rotation row carries `IDENTITY_MAT3`: no facing
 * modelled, not a fabricated pole. `simDays` turns the prime meridian:
 * `W = W₀ + Ẇ·(simDays − J2000)`, so at `CONST_J2000` the result is the
 * epoch facing.
 */

import { rotationRowById } from './rotationElements';
import { CONST_J2000 } from '../time/constJ2000';
import { rotationFromIau } from '../../utils/orbit/rotationFromIau';
import { IDENTITY_MAT3 } from '../../utils/math/identityMat3';
import type { Mat3 } from '../../@types/math/Mat3';
import type { Vec3 } from '../../@types/math/Vec3';

// `positions` is unread by the IAU-pole arm — which is what makes it safe to call
// this mid-derivation with a partial map; arms that aim a body at another body read it.
export function orientationForBody(
  id: string,
  simDays: number,
  positions: ReadonlyMap<string, Readonly<Vec3>>,
): Mat3 {
  const row = rotationRowById(id);

  // A fresh mutable copy of the shared readonly identity — the body record's
  // `orientation` is a mutable `Mat3`, and each body owns its own array.
  if (!row) return [...IDENTITY_MAT3] as Mat3;

  const primeMeridianDeg = row.primeMeridianDeg + row.spinRateDegPerDay * (simDays - CONST_J2000);
  return rotationFromIau(row, primeMeridianDeg);
}
