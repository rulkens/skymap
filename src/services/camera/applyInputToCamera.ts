/**
 * applyInputToCamera — apply one aggregated input step to the drag register.
 * Only the register is written; committing to the store is the drain's job.
 *
 * Drag right (+dx) DECREASES yaw: the world follows the hand ("globe" drag)
 * rather than the camera swinging rightward (FPS look).
 */

import { vec3 } from 'wgpu-matrix';

import { updatePosition } from '../../utils/camera/updatePosition';
import { zoomedDistance } from '../../utils/camera/zoomedDistance';
import { orbitRadPerPixel } from '../../utils/camera/orbitRadPerPixel';
import { imagePlaneBasis } from '../../utils/camera/imagePlaneBasis';
import { frameUp } from '../../utils/camera/frameUp';

import type { OrbitCamera } from '../../@types/camera/OrbitCamera';
import type { InputStep } from '../../@types/camera/InputStep';
import type { PivotFraming } from '../../@types/camera/PivotFraming';
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
 * orbit rate and floors the zoom.
 */
export function applyInputToCamera(
  cam: OrbitCamera,
  step: Extract<InputStep, { kind: 'drag' } | { kind: 'zoom' }>,
  cssHeight: number,
  pivot: PivotFraming,
): void {
  if (step.kind === 'zoom') {
    cam.distance = zoomedDistance(cam.distance, step.factor, pivot);
    updatePosition(cam);
    return;
  }

  const dx = step.endPx[0] - step.startPx[0];
  const dy = step.endPx[1] - step.startPx[1];

  if (step.mode === 'pan') {
    // Approximate "the point under the cursor follows the cursor" by translating
    // the target along the screen axes — no depth reprojection. Reference up is
    // the frame pole (world +Y absent a basis), so the pan tracks the frame.
    const forward: Vec3 = [0, 0, 0];
    vec3.subtract(cam.target, cam.position, forward);
    vec3.normalize(forward, forward);
    const basis = imagePlaneBasis(forward, 0, frameUp(cam.upBasis));

    // World units per CSS pixel at the target depth, both axes (pixels square).
    const pxToWorld = (2 * cam.distance * Math.tan(cam.fovYRad / 2)) / cssHeight;

    // Drag right → world slides right → target slides left. CSS y grows down
    // and cam-up points up-screen, so +dy → +up needs no extra flip.
    const panDelta = vec3.create();
    vec3.scale(basis.right, -dx * pxToWorld, panDelta);
    vec3.addScaled(panDelta, basis.up, dy * pxToWorld, panDelta);
    vec3.add(cam.target, panDelta, cam.target);
    updatePosition(cam);
    return;
  }

  // Damped by altitude above a focused body so the ground tracks the drag.
  const radPerPixel = orbitRadPerPixel(cam.fovYRad, cam.distance, cssHeight, pivot.radiusMpc);
  cam.yaw -= dx * radPerPixel;
  cam.pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, cam.pitch + dy * radPerPixel));
  updatePosition(cam);
}
