/**
 * approachTiltedPose — ruling 13: the world arm's in-window expression of the ONE
 * display-tilt mapping (`mappedTiltRad`), so the engage edge changes ownership of
 * the tilt, never the image. A pure per-frame projection between the pivot pin and
 * the fold: pitch the view off the FOCUSED body's nadir by the mapped amount,
 * rotating about the rolled screen-right with the eye fixed. The output reaches
 * ONLY `outputs.displayed`, never the authored register or `camera.base` (the
 * centre-looking invariant at `commitCameraPose`) — and the fold converts THIS pose,
 * so engage inherits `remembered × 1`. Zero remembered returns the input BY REFERENCE.
 */

import { bodyMovesThisFrame } from '../../../utils/scene/bodyMovesThisFrame';
import { SCENE_BODIES } from '../../../data/bodies/sceneBodies';
import { findByIdOrThrow } from '../../../utils/object/findByIdOrThrow';
import { isMeshBody } from '../../../utils/scene/isMeshBody';
import { hOverR } from './hOverR';
import { absoluteArm } from '../../../utils/camera/absoluteArm';
import { eyeMpcOf } from '../../../utils/camera/eyeMpcOf';
import { frameUp } from '../../../utils/camera/frameUp';
import { imagePlaneBasis } from '../../../utils/camera/imagePlaneBasis';
import { mappedTiltRad } from '../../../utils/camera/mappedTiltRad';
import { orbitAnglesLookingAlong } from '../../../utils/camera/orbitAnglesLookingAlong';
import { normalize3 } from '../../../utils/math/normalize3';
import type { BodyState } from '../../../@types/scene/BodyState';
import type { CameraTuning } from '../../../@types/camera/CameraTuning';
import type { FramedCameraPose } from '../../../@types/camera/FramedCameraPose';
import type { Mat3 } from '../../../@types/math/Mat3';
import type { SelectionRow } from '../../../@types/engine/SelectionRow';
import type { Vec3 } from '../../../@types/math/Vec3';

export function approachTiltedPose(
  framed: FramedCameraPose,
  pivotsOnFocusedBody: boolean,
  focusRow: SelectionRow | null,
  bodies: ReadonlyMap<string, BodyState>,
  rememberedTiltRad: number,
  poseBasis: Readonly<Mat3>,
  upBasis: Readonly<Mat3>,
  tuning: CameraTuning,
): FramedCameraPose {
  if (framed.frame !== 'absolute') return framed;
  if (!pivotsOnFocusedBody || rememberedTiltRad === 0) return framed;
  if (focusRow === null || focusRow.type !== 'body' || !bodyMovesThisFrame(focusRow)) {
    return framed;
  }
  // No ground, no nadir to tilt off: a mesh body's radius is a hull.
  const body = findByIdOrThrow(SCENE_BODIES, focusRow.id, 'approachTiltedPose');
  if (isMeshBody(body)) return framed;
  // `hOverR` is the sanctioned Mpc↔metre seam for the altitude.
  const bodyState = bodies.get(focusRow.id);
  if (bodyState === undefined) return framed;
  const centreMpc = bodyState.positionMpc;

  const pose = framed.pose;
  const eye = eyeMpcOf(pose, poseBasis);
  const rel: Vec3 = [eye[0] - centreMpc[0], eye[1] - centreMpc[1], eye[2] - centreMpc[2]];
  if (Math.hypot(...rel) === 0) return framed;
  const hr = hOverR(eye, bodyState, body.radiusM);
  const tau = mappedTiltRad(rememberedTiltRad, hr, tuning);
  if (tau < 1e-12) return framed; // at/above the band top — inert, by reference

  const n = normalize3(rel);
  const forward = normalize3([
    pose.target[0] - eye[0],
    pose.target[1] - eye[1],
    pose.target[2] - eye[2],
  ]);
  // Inlined rather than `tiltFromNadirRad`: the two round differently by an
  // ulp, and at heliocentric magnitudes the yaw/pitch decode amplifies that
  // to ~1e-9 — the golden trace holds this world-arm readout bit-for-bit.
  const vert = forward[0] * n[0] + forward[1] * n[1] + forward[2] * n[2];
  const currentTilt = Math.acos(Math.max(-1, Math.min(1, -vert)));
  const delta = tau - currentTilt;
  if (Math.abs(delta) < 1e-12) return framed;

  // Tip the view toward screen-up by the residual: rotation about the rolled
  // right in the forward/up plane (`right·forward = 0`, so Rodrigues reduces
  // to a plain rotation of forward toward up) — the same axis the tilt
  // handle drags about, so heading and roll are untouched.
  const { up } = imagePlaneBasis(forward, pose.roll ?? 0, frameUp(upBasis));
  const c = Math.cos(delta);
  const s = Math.sin(delta);
  const f: Vec3 = normalize3([
    forward[0] * c + up[0] * s,
    forward[1] * c + up[1] * s,
    forward[2] * c + up[2] * s,
  ]);
  const { yaw, pitch } = orbitAnglesLookingAlong(f, [...poseBasis] as Mat3);
  return absoluteArm({
    // Same recipe as the fold's disengage retarget: target on the new view
    // ray at the incumbent distance, so the decode reconstructs the SAME eye.
    target: [
      eye[0] + f[0] * pose.distance,
      eye[1] + f[1] * pose.distance,
      eye[2] + f[2] * pose.distance,
    ],
    yaw,
    pitch,
    distance: pose.distance,
    roll: pose.roll,
  });
}
