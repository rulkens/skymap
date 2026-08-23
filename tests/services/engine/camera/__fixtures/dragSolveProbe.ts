/**
 * Diagnostic twin of `surfaceDragRotation` that reports WHY it declines.
 * Byte-for-byte the same algorithm; the only additions are the reason string,
 * the achieved residual, and a switch that disables the FW-D `accept` bound so
 * the pre-FW-D behaviour can be compared on the same inputs.
 *
 * Test-only; not shipped.
 */

import { lonLatDegToDirection } from '../../../../../src/utils/scene/lonLatDegToDirection';
import { rotateVec3ByTightMat3 } from '../../../../../src/utils/math/rotateVec3ByTightMat3';
import { shortestAngleDelta } from '../../../../../src/utils/math/shortestAngleDelta';
import { yawPitchToDir } from '../../../../../src/utils/camera/yawPitchToDir';
import { imagePlaneBasis } from '../../../../../src/utils/camera/imagePlaneBasis';
import { eyeAltitudeMpc } from '../../../../../src/utils/camera/eyeAltitudeMpc';
import { groundTrackingRadPerPixel } from '../../../../../src/utils/camera/groundTrackingRadPerPixel';
import { PITCH_LIMIT } from '../../../../../src/utils/camera/pitchLimit';
import type { LonLatDeg } from '../../../../../src/@types/scene/LonLatDeg';
import type { Mat3 } from '../../../../../src/@types/math/Mat3';
import type { Vec3 } from '../../../../../src/@types/math/Vec3';

const MAX_NEWTON_ITERS = 20;
const RESIDUAL_TOL_PX = 1e-9;
const FINITE_DIFF_EPS_RAD = 1e-6;
const MAX_SOLVE_RATE_MULT = 6;
const MIN_SOLVE_STEP_PX = 1;

export type ProbeResult = {
  reason: 'ok' | 'behind-eye' | 'singular' | 'no-convergence' | 'pitch-limit' | 'step-bound';
  bestResidualPx: number;
  stepRad: number;
  maxStepRad: number;
  /** The Newton iterate the ORIGINAL (21ab20b20) solve returned unconditionally. */
  yaw: number;
  pitch: number;
};

export function dragSolveProbe(
  grabbedPoint: LonLatDeg,
  bodyOrientation: Readonly<Mat3>,
  bodyCentreMpc: Readonly<Vec3>,
  radiusMpc: number,
  cam: Readonly<{ target: Vec3; yaw: number; pitch: number; distance: number; poseBasis?: Mat3 }>,
  roll: number,
  upRef: Readonly<Vec3>,
  fovYRad: number,
  aspect: number,
  canvasCssSize: Readonly<{ width: number; height: number }>,
  cursorCss: Readonly<{ x: number; y: number }>,
  pxMoved: number,
): ProbeResult {
  const dirWorld = rotateVec3ByTightMat3(lonLatDegToDirection(grabbedPoint), bodyOrientation);
  const grabbedWorld: Vec3 = [
    bodyCentreMpc[0] + dirWorld[0] * radiusMpc,
    bodyCentreMpc[1] + dirWorld[1] * radiusMpc,
    bodyCentreMpc[2] + dirWorld[2] * radiusMpc,
  ];
  const tanHalfFovY = Math.tan(fovYRad / 2);

  const projectCss = (yaw: number, pitch: number): { x: number; y: number } | null => {
    const worldDir = rotateVec3ByTightMat3(yawPitchToDir(yaw, pitch), cam.poseBasis);
    const eye: Vec3 = [
      cam.target[0] + worldDir[0] * cam.distance,
      cam.target[1] + worldDir[1] * cam.distance,
      cam.target[2] + worldDir[2] * cam.distance,
    ];
    const forward: Vec3 = [-worldDir[0], -worldDir[1], -worldDir[2]];
    const basis = imagePlaneBasis(forward, roll, upRef);
    const vx = grabbedWorld[0] - eye[0];
    const vy = grabbedWorld[1] - eye[1];
    const vz = grabbedWorld[2] - eye[2];
    const depth = vx * forward[0] + vy * forward[1] + vz * forward[2];
    if (depth <= 0) return null;
    const rightComp = vx * basis.right[0] + vy * basis.right[1] + vz * basis.right[2];
    const upComp = vx * basis.up[0] + vy * basis.up[1] + vz * basis.up[2];
    const ndcX = rightComp / depth / (tanHalfFovY * aspect);
    const ndcY = upComp / depth / tanHalfFovY;
    return {
      x: ((ndcX + 1) * canvasCssSize.width) / 2,
      y: ((1 - ndcY) * canvasCssSize.height) / 2,
    };
  };

  const eyeDir = rotateVec3ByTightMat3(yawPitchToDir(cam.yaw, cam.pitch), cam.poseBasis);
  const eye0: Vec3 = [
    cam.target[0] + eyeDir[0] * cam.distance,
    cam.target[1] + eyeDir[1] * cam.distance,
    cam.target[2] + eyeDir[2] * cam.distance,
  ];
  const maxStepRad =
    MAX_SOLVE_RATE_MULT *
    groundTrackingRadPerPixel(
      fovYRad,
      eyeAltitudeMpc(eye0, bodyCentreMpc, radiusMpc),
      canvasCssSize.height,
      radiusMpc,
    ) *
    Math.max(pxMoved, MIN_SOLVE_STEP_PX);

  let yaw = cam.yaw;
  let pitch = cam.pitch;
  let best = Infinity;

  for (let i = 0; i < MAX_NEWTON_ITERS; i++) {
    const p0 = projectCss(yaw, pitch);
    if (p0 === null) {
      return { reason: 'behind-eye', bestResidualPx: best, stepRad: 0, maxStepRad, yaw, pitch };
    }
    const fx = p0.x - cursorCss.x;
    const fy = p0.y - cursorCss.y;
    best = Math.min(best, Math.max(Math.abs(fx), Math.abs(fy)));
    if (Math.abs(fx) < RESIDUAL_TOL_PX && Math.abs(fy) < RESIDUAL_TOL_PX) {
      const dYaw = shortestAngleDelta(cam.yaw, yaw);
      const dPitch = pitch - cam.pitch;
      const step = Math.hypot(dYaw, dPitch);
      if (Math.abs(pitch) > PITCH_LIMIT) {
        return {
          reason: 'pitch-limit',
          bestResidualPx: best,
          stepRad: step,
          maxStepRad,
          yaw,
          pitch,
        };
      }
      if (!(step <= maxStepRad)) {
        return {
          reason: 'step-bound',
          bestResidualPx: best,
          stepRad: step,
          maxStepRad,
          yaw,
          pitch,
        };
      }
      return { reason: 'ok', bestResidualPx: best, stepRad: step, maxStepRad, yaw, pitch };
    }

    const py = projectCss(yaw + FINITE_DIFF_EPS_RAD, pitch);
    const pp = projectCss(yaw, pitch + FINITE_DIFF_EPS_RAD);
    if (py === null || pp === null) {
      return { reason: 'behind-eye', bestResidualPx: best, stepRad: 0, maxStepRad, yaw, pitch };
    }
    const j00 = (py.x - p0.x) / FINITE_DIFF_EPS_RAD;
    const j10 = (py.y - p0.y) / FINITE_DIFF_EPS_RAD;
    const j01 = (pp.x - p0.x) / FINITE_DIFF_EPS_RAD;
    const j11 = (pp.y - p0.y) / FINITE_DIFF_EPS_RAD;
    const det = j00 * j11 - j01 * j10;
    if (Math.abs(det) < 1e-12) {
      return { reason: 'singular', bestResidualPx: best, stepRad: 0, maxStepRad, yaw, pitch };
    }
    yaw += (-fx * j11 + fy * j01) / det;
    pitch += (j10 * fx - j00 * fy) / det;
  }

  const dYaw = shortestAngleDelta(cam.yaw, yaw);
  return {
    reason: 'no-convergence',
    bestResidualPx: best,
    stepRad: Math.hypot(dYaw, pitch - cam.pitch),
    maxStepRad,
    yaw,
    pitch,
  };
}
