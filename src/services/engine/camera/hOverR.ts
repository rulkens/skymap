/**
 * hOverR — a world eye's altitude over a body, in radius units. Eye-based
 * (FW-A), never pivot-derived, and reuses `bodyRelativePose` — spec §10's one
 * permitted Mpc↔metre seam for the engaged camera path — rather than
 * importing the scale constants again; the basis argument is discarded, so
 * any orthonormal matrix works. One home for the regime predicate, the
 * roster scan, and the camera debug readout.
 */

import type { Vec3 } from '../../../@types/math/Vec3';
import type { BodyState } from '../../../@types/scene/BodyState';
import { IDENTITY_MAT3 } from '../../../utils/math/identityMat3';
import { bodyRelativePose } from './bodyRelativePose';

export function hOverR(eyeMpc: Readonly<Vec3>, bodyState: BodyState, radiusM: number): number {
  const { eyeRelBodyM } = bodyRelativePose({
    camPosMpc: eyeMpc,
    camBasisWorld: IDENTITY_MAT3,
    bodyState,
  });
  const distanceM = Math.hypot(eyeRelBodyM[0], eyeRelBodyM[1], eyeRelBodyM[2]);
  return (distanceM - radiusM) / radiusM;
}
