/**
 * surfaceReadoutOf — the KML `LookAt`-style readout (standpoint, heading,
 * tilt, range, altitude) for a body-fixed pose, in the ENU of the point
 * under the screen centre (spec §3, §14).
 *
 * `altitudeM` is `|eye| − R`, computed once from the eye alone and never
 * touched by the forward-ray geometry below (FW-A). `tiltRad` is measured
 * from local nadir, per the type's own doc comment.
 */

import type { BodyFixedPose } from '../../@types/camera/BodyFixedPose';
import type { SurfaceReadout } from '../../@types/camera/SurfaceReadout';
import type { Vec3 } from '../../@types/math/Vec3';
import { headingTiltAt } from './headingTiltAt';
import { raySphereRoots } from '../math/raySphereRoots';
import { directionToLonLatDeg } from '../scene/directionToLonLatDeg';

const ORIGIN: Vec3 = [0, 0, 0];

function normalize(v: Readonly<Vec3>): Vec3 {
  const len = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / len, v[1] / len, v[2] / len];
}

export function surfaceReadoutOf(pose: BodyFixedPose, bodyRadiusM: number): SurfaceReadout {
  const { anchorLocalM, eyeRelAnchorM, basisLocal } = pose;
  const eye: Vec3 = [
    anchorLocalM[0] + eyeRelAnchorM[0],
    anchorLocalM[1] + eyeRelAnchorM[1],
    anchorLocalM[2] + eyeRelAnchorM[2],
  ];
  const eyeMagM = Math.hypot(eye[0], eye[1], eye[2]);
  const altitudeM = eyeMagM - bodyRadiusM;

  // Columns: right = [0,1,2], up = [3,4,5], forward = [6,7,8] (BodyFixedPose doc).
  const forward: Vec3 = [basisLocal[6], basisLocal[7], basisLocal[8]];
  const up: Vec3 = [basisLocal[3], basisLocal[4], basisLocal[5]];

  const roots = raySphereRoots(eye, forward, ORIGIN, bodyRadiusM);
  const tNear = roots !== null ? roots[0] : -1;

  let target: Vec3;
  let rangeM: number;
  if (tNear > 0) {
    target = [
      eye[0] + forward[0] * tNear,
      eye[1] + forward[1] * tNear,
      eye[2] + forward[2] * tNear,
    ];
    rangeM = tNear;
  } else {
    // Forward misses the sphere (looking at the sky, spec §6d): standpoint
    // SNAPS to the eye's nadir footprint — discontinuous at the tangency
    // angle (arccos(R/(R+h)) from nadir), not a continuous limit of the hit
    // case. This readout is display currency; engaged-path code (gestures,
    // tilt enforcement) derives its own eye-anchored ENU rather than reading
    // this fallback.
    const nadirDir = normalize(eye);
    target = [nadirDir[0] * bodyRadiusM, nadirDir[1] * bodyRadiusM, nadirDir[2] * bodyRadiusM];
    rangeM = altitudeM;
  }

  const localUp = normalize(target);
  const standpoint = directionToLonLatDeg(localUp);
  const { headingRad, tiltRad } = headingTiltAt(localUp, forward, up);

  return { standpoint, headingRad, tiltRad, rangeM, altitudeM };
}
