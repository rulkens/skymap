/**
 * orientationForBody — bake a scene body's local → equatorial-world rotation
 * from its id, dispatching on the rotation row's arm. A body with no rotation
 * row carries `IDENTITY_MAT3`: no facing modelled, not a fabricated pole.
 * `simDays` turns an IAU body's prime meridian: `W = W₀ + Ẇ·(simDays − J2000)`,
 * so at `CONST_J2000` the result is the epoch facing.
 */

import { rotationRowById } from './rotationElements';
import { bodyHostId } from './positionDrivers';
import { CONST_J2000 } from '../time/constJ2000';
import { rotationFromIau } from '../../utils/orbit/rotationFromIau';
import { rotationLookAt } from '../../utils/orbit/rotationLookAt';
import { rotationSurfaceLocked } from '../../utils/orbit/rotationSurfaceLocked';
import { IDENTITY_MAT3 } from '../../utils/math/identityMat3';
import type { Mat3 } from '../../@types/math/Mat3';
import type { Vec3 } from '../../@types/math/Vec3';

function positionOrThrow(
  positions: ReadonlyMap<string, Readonly<Vec3>>,
  needed: string,
  forId: string,
): Readonly<Vec3> {
  const position = positions.get(needed);
  if (position === undefined) {
    throw new Error(
      `orientationForBody: '${forId}' needs the position of '${needed}', which is not derived yet`,
    );
  }
  return position;
}

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

  switch (row.kind) {
    // The 21 authored rows predate the union and carry no discriminant.
    case undefined:
    case 'iau-pole': {
      const primeMeridianDeg =
        row.primeMeridianDeg + row.spinRateDegPerDay * (simDays - CONST_J2000);
      return rotationFromIau(row, primeMeridianDeg);
    }
    case 'lookAt':
      return rotationLookAt(
        positionOrThrow(positions, id, id),
        positionOrThrow(positions, row.targetId, id),
      );
    case 'surfaceLocked': {
      // The row carries only the heading; the host comes from the position
      // driver, so a site names its host once. The host is an IAU-pole body,
      // so this recursion reads no positions and terminates at one level.
      const hostId = bodyHostId(id);
      if (hostId === null) {
        throw new Error(`orientationForBody: surface-locked '${id}' hangs off no host`);
      }
      const hostOrientation = orientationForBody(hostId, simDays, positions);
      const hostPoleWorld: Vec3 = [hostOrientation[6], hostOrientation[7], hostOrientation[8]];
      return rotationSurfaceLocked(
        positionOrThrow(positions, id, id),
        positionOrThrow(positions, hostId, id),
        hostPoleWorld,
        row.headingDeg,
      );
    }
    default: {
      const unreachable: never = row;
      return unreachable;
    }
  }
}
