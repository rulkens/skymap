/**
 * surfaceDragRotation — cursor-anchored orbit-drag (spec §4.4). Over the
 * 10-line budget: an original-derivation module, comments.md's stated
 * exception for maths unreadable without it.
 *
 * Solves the absolute (yaw, pitch) that reprojects a grabbed body-surface
 * point back under THIS tick's cursor — exactly, not `orbitRadPerPixel`'s
 * altitude-damped rate (correct only at screen centre, per its own header).
 * `target`/`distance` are read, never written (§4.4's distance semantics
 * untouched). Returns `null` on a degenerate solve (grab behind the eye,
 * near-singular Jacobian) or when the best iterate is still a whole pixel off —
 * the caller treats that the same as a genuine miss and falls back to the flat
 * rate.
 *
 * `projectCss(yaw, pitch)` is the closed-form inverse of `cursorRayWorld`'s
 * NDC→direction formula, built from the SAME `roll`/`upRef` the caller feeds
 * `cursorRayWorld` — the actually-rendered screen basis is `cam.roll` /
 * `frameUp(cam.upBasis)` (see `computeViewProj.ts`), NOT `poseBasis`, which
 * only governs the yaw/pitch DECODE (where the eye sits), never the screen
 * plane. Two-variable Newton drives the projection's residual against
 * `cursorCss` to zero, with a FRESH finite-difference Jacobian every step.
 * A converged root is then screened for trustworthiness — see `accept` below.
 */

import { lonLatDegToDirection } from '../scene/lonLatDegToDirection';
import { rotateVec3ByTightMat3 } from '../math/rotateVec3ByTightMat3';
import { shortestAngleDelta } from '../math/shortestAngleDelta';
import { yawPitchToDir } from './yawPitchToDir';
import { imagePlaneBasis } from './imagePlaneBasis';
import { eyeAltitudeMpc } from './eyeAltitudeMpc';
import { groundTrackingRadPerPixel } from './groundTrackingRadPerPixel';
import { PITCH_LIMIT } from './pitchLimit';
import type { LonLatDeg } from '../../@types/scene/LonLatDeg';
import type { Mat3 } from '../../@types/math/Mat3';
import type { Vec3 } from '../../@types/math/Vec3';

const MAX_NEWTON_ITERS = 20;
/**
 * Convergence floor in CSS pixels, and NOT tightenable: with the body 1 AU from
 * the world origin `grabbedWorld − eye` cancels four decades of mantissa, so
 * the achievable residual bottoms out near 1e-6 px at surface altitudes. The
 * 1e-9 this asked for was unreachable, and every low-altitude drag "failed"
 * into the flat rate, whose horizontal gain is cos(latitude). The real cure is
 * solving in body-relative coordinates, where nothing cancels.
 */
const RESIDUAL_TOL_PX = 1e-3;
/** A run that never met the floor is still usable while its residual is under a
 * pixel and better than not moving — that iterate sits at the noise floor, not
 * on a wrong branch, and the alternative is the flat rate. */
const USABLE_RESIDUAL_PX = 1;
const FINITE_DIFF_EPS_RAD = 1e-6;

/**
 * How many times the centre-screen ground-tracking rate this solve may exceed
 * before its answer is treated as a failure. Measured against the solve itself
 * over 0.001–200 body radii of altitude, every disc position out to 0.7 of the
 * visible radius, pitches to 63°, drags of 1–36 px: median 1.30x, p90 2.44x,
 * p95 3.61x. 6 clears p95 by 1.7x and still accepts 98% of that sample, while
 * shedding the tail — grazing-limb and near-pole configurations whose
 * pixel-exact answer is a 10°-per-pixel lurch, and far Newton roots (the
 * captured bug reached 204 rad of yaw on a 2 px drag).
 */
const MAX_SOLVE_RATE_MULT = 6;

/** A sub-pixel event still gets one pixel of allowance, so the cap can never
 * collapse to zero on a fractional-CSS-pixel move. */
const MIN_SOLVE_STEP_PX = 1;

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
  // CSS pixels the cursor moved on THIS event — the yardstick the accepted
  // rotation is bounded against (see `MAX_SOLVE_RATE_MULT`).
  pxMoved: number,
): { readonly yaw: number; readonly pitch: number } | null {
  // Fixed world position of the grabbed point. local→world: bodyOrientation's
  // columns are local axes in world space (the convention `lonLatFocusPose`
  // shares) — this stays exact even as the body itself
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

  // The rotation this event is allowed to spend, in the same currency the flat
  // rate is quoted in: `groundTrackingRadPerPixel` at the PRE-event eye is
  // exactly what a screen-centre grab needs, and the allowance is a multiple of
  // it. Nothing else bounds Newton — it will happily converge onto a root many
  // turns away, or onto the true-but-hyper-sensitive root of a grazing-limb
  // grab, and either reads on screen as the jump this cap exists to shed.
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

  // A converged root is only usable if it is the branch the camera is ON and
  // the step it asks for is one the drag could plausibly want.
  //   - Yaw is re-based to its nearest representative: the projection is
  //     2π-periodic in yaw, so a root 10 turns out (the captured 65.87 rad) is
  //     the same pose stated absurdly — and the register would keep the absurd
  //     number as the next event's starting guess.
  //   - Past `PITCH_LIMIT` the answer is a FAILURE, not something to clamp:
  //     clamping silently breaks the cursor lock the solve exists to hold.
  //   - The step is the EYE's angular travel, not `hypot(Δyaw, Δpitch)`: yaw is
  //     a coordinate, and near the pole a ground-correct drag legitimately
  //     spends 1/cos(lat) of it (11.5x at 85°) while the eye barely moves.
  //     Pricing the coordinate made this cap an implicit 80.4° latitude ceiling;
  //     pricing the eye still sheds the lurches it exists for.
  const accept = (
    yawRaw: number,
    pitchSolved: number,
  ): { readonly yaw: number; readonly pitch: number } | null => {
    if (Math.abs(pitchSolved) > PITCH_LIMIT) return null;
    const dYaw = shortestAngleDelta(cam.yaw, yawRaw);
    const from = yawPitchToDir(cam.yaw, cam.pitch);
    const to = yawPitchToDir(cam.yaw + dYaw, pitchSolved);
    const dot = from[0] * to[0] + from[1] * to[1] + from[2] * to[2];
    // Negated comparison so a non-finite step fails the test rather than passing it.
    if (!(Math.acos(Math.min(1, Math.max(-1, dot))) <= maxStepRad)) return null;
    // Near-hemisphere belt: `projectCss` has no occlusion test and the eye-priced
    // bound is blind to yaw about the pole, so a pose that put the grabbed point
    // on the FAR side of the body and still projected it under the cursor would
    // otherwise be admissible near `PITCH_LIMIT`.
    const solvedEyeDir = rotateVec3ByTightMat3(to, cam.poseBasis);
    const facing =
      dirWorld[0] * (cam.target[0] + solvedEyeDir[0] * cam.distance - bodyCentreMpc[0]) +
      dirWorld[1] * (cam.target[1] + solvedEyeDir[1] * cam.distance - bodyCentreMpc[1]) +
      dirWorld[2] * (cam.target[2] + solvedEyeDir[2] * cam.distance - bodyCentreMpc[2]);
    if (!(facing > 0)) return null;
    return { yaw: cam.yaw + dYaw, pitch: pitchSolved };
  };

  let yaw = cam.yaw;
  let pitch = cam.pitch;
  // Kept because Newton at the cancellation floor wanders rather than converges,
  // so the LAST iterate is not the closest one.
  let bestYaw = yaw;
  let bestPitch = pitch;
  let bestResidualPx = Infinity;
  let standingResidualPx = Infinity;

  for (let i = 0; i < MAX_NEWTON_ITERS; i++) {
    const p0 = projectCss(yaw, pitch);
    if (p0 === null) return null;
    const fx = p0.x - cursorCss.x;
    const fy = p0.y - cursorCss.y;
    const residualPx = Math.max(Math.abs(fx), Math.abs(fy));
    if (i === 0) standingResidualPx = residualPx;
    if (residualPx < bestResidualPx) {
      bestResidualPx = residualPx;
      bestYaw = yaw;
      bestPitch = pitch;
    }
    if (residualPx < RESIDUAL_TOL_PX) return accept(yaw, pitch);

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

  // Exhausted, but "did not reach the floor" is not "no answer": take the best
  // iterate while it is sub-pixel and closer than standing still.
  if (bestResidualPx < USABLE_RESIDUAL_PX && bestResidualPx < standingResidualPx) {
    return accept(bestYaw, bestPitch);
  }
  return null;
}
