/**
 * surfaceZoomBias — cursor-directed zoom (spec §4.2): an eye-position DELTA,
 * world Mpc, that converges the orbit eye toward the anchor point as altitude
 * shrinks. Never writes `target`/`distance` — every reader gated on them
 * (scale bar, near-plane, NEAR0 layers) is unaffected; the caller adds this
 * delta to `cam.position` only. `eyePosMpc` is a 6th parameter beyond the
 * spec's stated 5 (SDD Task 2 ground-note correction): "converge toward the
 * anchor under the eye" needs the CURRENT eye to converge toward.
 */

import type { LonLatDeg } from '../../@types/scene/LonLatDeg';
import type { Mat3 } from '../../@types/math/Mat3';
import type { Vec3 } from '../../@types/math/Vec3';
import { lonLatDegToDirection } from '../scene/lonLatDegToDirection';
import { rotateVec3ByTightMat3 } from '../math/rotateVec3ByTightMat3';

// Falloff scale, body radii of altitude — a "final approach" convergence,
// not an always-on orbit effect: decays to ~37% by one radius of altitude,
// negligible past ~5 (tuned constant, mirroring ORBIT_MAX_RAD_PER_PX's style).
export const FALLOFF_RADII = 1;

/** `altitudeMpc` is `distance - radiusMpc`; `eyePosMpc` is the eye BEFORE this delta. */
export function surfaceZoomBias(
  anchor: LonLatDeg,
  bodyOrientation: Readonly<Mat3>,
  bodyCentreMpc: Readonly<Vec3>,
  radiusMpc: number,
  altitudeMpc: number,
  eyePosMpc: Readonly<Vec3>,
): Vec3 {
  // local→world (untransposed) — the convention `lonLatFocusPose.ts` uses.
  const anchorWorldDir = rotateVec3ByTightMat3(lonLatDegToDirection(anchor), bodyOrientation);

  const r = radiusMpc + altitudeMpc;
  const targetEyePos: Vec3 = [
    bodyCentreMpc[0] + anchorWorldDir[0] * r,
    bodyCentreMpc[1] + anchorWorldDir[1] * r,
    bodyCentreMpc[2] + anchorWorldDir[2] * r,
  ];

  const t = Math.exp(-altitudeMpc / (radiusMpc * FALLOFF_RADII));

  return [
    t * (targetEyePos[0] - eyePosMpc[0]),
    t * (targetEyePos[1] - eyePosMpc[1]),
    t * (targetEyePos[2] - eyePosMpc[2]),
  ];
}
