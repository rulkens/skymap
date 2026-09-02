/**
 * applyInputToCamera — fold one aggregated input step over a world-arm pose.
 * Pure: returns the next pose; committing to the store is the drain's job.
 *
 * Drag right (+dx) DECREASES yaw: the world follows the hand ("globe" drag)
 * rather than the camera swinging rightward (FPS look).
 */

import { vec3 } from 'wgpu-matrix';

import { zoomedDistance } from '../../utils/camera/zoomedDistance';
import { orbitRadPerPixel } from '../../utils/camera/orbitRadPerPixel';
import { imagePlaneBasis } from '../../utils/camera/imagePlaneBasis';
import { frameUp } from '../../utils/camera/frameUp';
import { eyeMpcOf } from '../../utils/camera/eyeMpcOf';

import type { CameraPose } from '../../@types/camera/CameraPose';
import type { InputStep } from '../../@types/camera/InputStep';
import type { PivotFraming } from '../../@types/camera/PivotFraming';
import type { Mat3 } from '../../@types/math/Mat3';
import type { Vec3 } from '../../@types/math/Vec3';

/**
 * Pitch ceiling. At exactly ±π/2 forward is collinear with the reference up and
 * `lookAt` degenerates to an all-NaN view matrix (gimbal lock); the 0.01 rad
 * (≈0.57°) gap is invisible.
 */
const PITCH_LIMIT = Math.PI / 2 - 0.01;

/**
 * `cssHeight` is the CSS height, NOT the backing store — gesture feel must not
 * depend on devicePixelRatio. `pivot` (radius `null`: no surface) damps the
 * orbit rate and floors the zoom. `poseBasis` decodes the eye for the pan's
 * image plane; `upBasis` supplies the pole the pan tracks.
 */
export function applyInputToCamera(
  pose: CameraPose,
  step: Extract<InputStep, { kind: 'drag' } | { kind: 'zoom' }>,
  cssHeight: number,
  pivot: PivotFraming,
  fovYRad: number,
  poseBasis: Readonly<Mat3>,
  upBasis: Readonly<Mat3>,
): CameraPose {
  if (step.kind === 'zoom') {
    return { ...pose, distance: zoomedDistance(pose.distance, step.factor, pivot) };
  }

  const dx = step.endPx[0] - step.startPx[0];
  const dy = step.endPx[1] - step.startPx[1];

  if (step.mode === 'pan') {
    // Approximate "the point under the cursor follows the cursor" by translating
    // the target along the screen axes — no depth reprojection. Reference up is
    // the frame pole, so the pan tracks the frame.
    const eye = eyeMpcOf(pose, poseBasis);
    const forward: Vec3 = [0, 0, 0];
    vec3.subtract(pose.target, eye, forward);
    vec3.normalize(forward, forward);
    const basis = imagePlaneBasis(forward, 0, frameUp(upBasis));

    // World units per CSS pixel at the target depth, both axes (pixels square).
    const pxToWorld = (2 * pose.distance * Math.tan(fovYRad / 2)) / cssHeight;

    // Drag right → world slides right → target slides left. CSS y grows down
    // and cam-up points up-screen, so +dy → +up needs no extra flip.
    const target: Vec3 = [
      pose.target[0] + basis.right[0] * -dx * pxToWorld + basis.up[0] * dy * pxToWorld,
      pose.target[1] + basis.right[1] * -dx * pxToWorld + basis.up[1] * dy * pxToWorld,
      pose.target[2] + basis.right[2] * -dx * pxToWorld + basis.up[2] * dy * pxToWorld,
    ];
    return { ...pose, target };
  }

  // Damped by altitude above a focused body so the ground tracks the drag.
  const radPerPixel = orbitRadPerPixel(fovYRad, pose.distance, cssHeight, pivot.radiusMpc);
  return {
    ...pose,
    yaw: pose.yaw - dx * radPerPixel,
    pitch: Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, pose.pitch + dy * radPerPixel)),
  };
}
