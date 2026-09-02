/**
 * frameAlignedRoll — the world-arm frame transition (ruling 8, tilt
 * discipline per fix round 3): the altitude curve defines the roll TARGET — a
 * screen-up blend from the nearest body's spin axis (band floor) to the
 * configured scene up (band top, via `frameUp(upBasis)` — never hardcoded) —
 * and each at-rest notch RIDES the target's change in full, so a recession is
 * structurally back at the global up by h/R 3.4. The capped `orientStepRad`
 * decay is reserved for deviation the zoom did not author (arrivals). The
 * blend is taken on VECTORS, weighting the pole term by its own projection
 * size, so a view passing near either axis degrades smoothly instead of
 * chasing a flipping projection.
 */

import type { BodyId } from '../../../@types/data/body/BodyId';
import type { BodyState } from '../../../@types/scene/BodyState';
import type { CameraPose } from '../../../@types/camera/CameraPose';
import type { Mat3 } from '../../../@types/math/Mat3';
import type { Vec3 } from '../../../@types/math/Vec3';
import { SURFACE_REGIME } from '../../../data/camera/surfaceRegime';
import { eyeMpcOf } from '../../../utils/camera/eyeMpcOf';
import { frameUp } from '../../../utils/camera/frameUp';
import { maxTiltRad } from '../../../utils/camera/maxTiltRad';
import { orientStepRad } from '../../../utils/camera/orientStepRad';
import { rollFromScreenUp } from '../../../utils/camera/rollFromScreenUp';
import { normalize3 } from '../../../utils/math/normalize3';
import { rotateVec3ByTightMat3 } from '../../../utils/math/rotateVec3ByTightMat3';
import { nearestBodyHR } from './nearestBodyHR';

/** `v` minus its `forward` component — the image-plane part, unnormalized. */
function imagePlanePart(v: Readonly<Vec3>, forward: Readonly<Vec3>): Vec3 {
  const vert = v[0] * forward[0] + v[1] * forward[1] + v[2] * forward[2];
  return [v[0] - forward[0] * vert, v[1] - forward[1] * vert, v[2] - forward[2] * vert];
}

/**
 * The curve-defined roll target at this pose, with the band authority it was
 * blended at; `null` when no target exists (empty roster, forward down the
 * frame pole, or the blend's one anti-parallel knot) — callers hold the roll.
 */
function bandRollTarget(
  pose: CameraPose,
  bodyStates: ReadonlyMap<BodyId, BodyState>,
  poseBasis: Readonly<Mat3>,
  upBasis: Readonly<Mat3>,
): { readonly rad: number; readonly authority: number } | null {
  const eyeMpc = eyeMpcOf(pose, poseBasis);
  const nearest = nearestBodyHR(eyeMpc, bodyStates);
  if (nearest === null) return null;
  const authority = maxTiltRad(nearest.hr) / SURFACE_REGIME.tiltMaxRad;

  const forward = normalize3([
    pose.target[0] - eyeMpc[0],
    pose.target[1] - eyeMpc[1],
    pose.target[2] - eyeMpc[2],
  ]);
  const upRef = frameUp(upBasis);
  const uRaw = imagePlanePart(upRef, forward);
  if (Math.hypot(...uRaw) < 1e-9) return null; // roll itself is undefined here
  const pRaw = imagePlanePart(
    rotateVec3ByTightMat3([0, 0, 1], nearest.bodyState.orientation),
    forward,
  );
  // Raw (unnormalized) projections: the pole term carries its own sin∠ weight,
  // so a view near the spin axis hands the target to the scene up smoothly —
  // normalizing first is what chased a flipping projection (measured: 85° of
  // roll from 2° off-axis).
  const blend: Vec3 = [
    authority * pRaw[0] + (1 - authority) * uRaw[0],
    authority * pRaw[1] + (1 - authority) * uRaw[1],
    authority * pRaw[2] + (1 - authority) * uRaw[2],
  ];
  if (Math.hypot(...blend) < 1e-9) return null; // pole-down anti-parallel knot
  return { rad: rollFromScreenUp(forward, normalize3(blend), upRef), authority };
}

export function frameAlignedRoll(
  prePose: CameraPose,
  postPose: CameraPose,
  bodyStates: ReadonlyMap<BodyId, BodyState>,
  poseBasis: Readonly<Mat3>,
  upBasis: Readonly<Mat3>,
): number {
  const currentRoll = postPose.roll ?? 0;
  const tPre = bandRollTarget(prePose, bodyStates, poseBasis, upBasis);
  const tNew = bandRollTarget(postPose, bodyStates, poseBasis, upBasis);
  if (tPre === null || tNew === null) return currentRoll;
  // Wholly outside the band the mechanism owns nothing — an arrival roll in
  // deep space is not bled by wheel notches.
  if (tPre.authority <= 0 && tNew.authority <= 0) return currentRoll;
  // Ride the target's own movement in full (the notch authored it); decay
  // only the pre-existing deviation, capped — the tilt wall's exact shape.
  const dRad = Math.atan2(Math.sin(currentRoll - tPre.rad), Math.cos(currentRoll - tPre.rad));
  return tNew.rad + dRad - orientStepRad(dRad);
}
