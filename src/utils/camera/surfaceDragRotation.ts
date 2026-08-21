/**
 * surfaceDragRotation — cursor-anchored orbit-drag (spec §4.4). Over the
 * 10-line budget: an original-derivation module, comments.md's stated
 * exception for maths unreadable without it.
 *
 * Solves the absolute (yaw, pitch) that reprojects a grabbed body-surface
 * point back under THIS tick's cursor — exactly, not `orbitRadPerPixel`'s
 * altitude-damped rate (correct only at screen centre, per its own header).
 * `target`/`distance` are read, never written (§4.4's distance semantics
 * untouched). Returns `null` on a non-convergent or degenerate solve (grab
 * behind the eye, near-singular Jacobian) — the caller treats that the same
 * as a genuine miss and falls back to the flat rate.
 *
 * `projectCss(yaw, pitch)` is the closed-form inverse of `cursorRayWorld`'s
 * NDC→direction formula, built from the SAME `roll`/`upRef` the caller feeds
 * `cursorRayWorld` — the actually-rendered screen basis is `cam.roll` /
 * `frameUp(cam.upBasis)` (see `computeViewProj.ts`), NOT `poseBasis`, which
 * only governs the yaw/pitch DECODE (where the eye sits), never the screen
 * plane. Two-variable Newton drives the projection's residual against
 * `cursorCss` to zero, with a FRESH finite-difference Jacobian every step —
 * full convergence inside one call, not a single linear step, so a big
 * cursor jump or a limb grab still lands exactly.
 */

import { lonLatDegToDirection } from '../scene/lonLatDegToDirection';
import { rotateVec3ByTightMat3 } from '../math/rotateVec3ByTightMat3';
import { yawPitchToDir } from './yawPitchToDir';
import { imagePlaneBasis } from './imagePlaneBasis';
import type { LonLatDeg } from '../../@types/scene/LonLatDeg';
import type { Mat3 } from '../../@types/math/Mat3';
import type { Vec3 } from '../../@types/math/Vec3';

const MAX_NEWTON_ITERS = 20;
const RESIDUAL_TOL_PX = 1e-9;
const FINITE_DIFF_EPS_RAD = 1e-6;

export function surfaceDragRotation(
  grabbedPoint: LonLatDeg,
  bodyOrientation: Readonly<Mat3>,
  bodyCentreMpc: Readonly<Vec3>,
  radiusMpc: number,
  cam: Readonly<{
    readonly target: Vec3;
    readonly yaw: number;
    readonly pitch: number;
    readonly distance: number;
    readonly poseBasis?: Mat3;
  }>,
  // The rendered screen basis (see this module's header) — pass `cam.roll ??
  // 0` and `frameUp(cam.upBasis)`, the same pair `cursorRayWorld` callers feed
  // it, so the drag's screen projection agrees with what's actually on screen.
  roll: number,
  upRef: Readonly<Vec3>,
  fovYRad: number,
  aspect: number,
  canvasCssSize: Readonly<{ width: number; height: number }>,
  cursorCss: Readonly<{ x: number; y: number }>,
): { readonly yaw: number; readonly pitch: number } | null {
  // Fixed world position of the grabbed point. local→world: bodyOrientation's
  // columns are local axes in world space (the convention `surfaceZoomBias`
  // and `lonLatFocusPose` share) — this stays exact even as the body itself
  // moves/rotates between ticks, since the caller re-derives orientation and
  // centre fresh every pointermove.
  const dirWorld = rotateVec3ByTightMat3(lonLatDegToDirection(grabbedPoint), bodyOrientation);
  const grabbedWorld: Vec3 = [
    bodyCentreMpc[0] + dirWorld[0] * radiusMpc,
    bodyCentreMpc[1] + dirWorld[1] * radiusMpc,
    bodyCentreMpc[2] + dirWorld[2] * radiusMpc,
  ];

  const tanHalfFovY = Math.tan(fovYRad / 2);

  // Where would `grabbedWorld` land in CSS pixels for a trial (yaw, pitch)?
  // `null` when the point falls behind the eye (defensive — a live grab is
  // always in front of the camera it was captured from).
  const projectCss = (yaw: number, pitch: number): { x: number; y: number } | null => {
    const worldDir = rotateVec3ByTightMat3(yawPitchToDir(yaw, pitch), cam.poseBasis);
    const eye: Vec3 = [
      cam.target[0] + worldDir[0] * cam.distance,
      cam.target[1] + worldDir[1] * cam.distance,
      cam.target[2] + worldDir[2] * cam.distance,
    ];
    const forward: Vec3 = [-worldDir[0], -worldDir[1], -worldDir[2]];
    const basis = imagePlaneBasis(forward, roll, upRef);

    // Decompose (grabbedWorld - eye) into the orthonormal (forward, right,
    // up) basis: `depth` is how far along the view axis it sits, the other
    // two are its screen-plane offset as a FRACTION of that depth — exactly
    // the `sx`/`sy` cursorRayWorld builds its ray direction from, run in
    // reverse.
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

  let yaw = cam.yaw;
  let pitch = cam.pitch;

  for (let i = 0; i < MAX_NEWTON_ITERS; i++) {
    const p0 = projectCss(yaw, pitch);
    if (p0 === null) return null;
    const fx = p0.x - cursorCss.x;
    const fy = p0.y - cursorCss.y;
    if (Math.abs(fx) < RESIDUAL_TOL_PX && Math.abs(fy) < RESIDUAL_TOL_PX) return { yaw, pitch };

    const py = projectCss(yaw + FINITE_DIFF_EPS_RAD, pitch);
    const pp = projectCss(yaw, pitch + FINITE_DIFF_EPS_RAD);
    if (py === null || pp === null) return null;

    const j00 = (py.x - p0.x) / FINITE_DIFF_EPS_RAD; // ∂x/∂yaw
    const j10 = (py.y - p0.y) / FINITE_DIFF_EPS_RAD; // ∂y/∂yaw
    const j01 = (pp.x - p0.x) / FINITE_DIFF_EPS_RAD; // ∂x/∂pitch
    const j11 = (pp.y - p0.y) / FINITE_DIFF_EPS_RAD; // ∂y/∂pitch

    // Solve J·[dYaw, dPitch]ᵀ = -[fx, fy]ᵀ via Cramer's rule.
    const det = j00 * j11 - j01 * j10;
    if (Math.abs(det) < 1e-12) return null; // near-singular (e.g. straight down a pole)

    yaw += (-fx * j11 + fy * j01) / det;
    pitch += (j10 * fx - j00 * fy) / det;
  }

  return null; // MAX_NEWTON_ITERS exhausted without meeting the residual tolerance
}
