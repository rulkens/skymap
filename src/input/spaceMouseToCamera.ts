/**
 * spaceMouseToCamera — map shaped 6DOF axes to orbit-camera mutations.
 *
 * ### What this module does
 *
 * Takes a `SpaceMouseAxes` reading (already normalised AND curved by
 * `spaceMouseSensitivity.applyCurve`) plus a frame delta in milliseconds,
 * and applies the corresponding incremental change to an orbit camera in
 * place.
 *
 * ### Axis → camera-channel mapping
 *
 *   tx (puck push left/right) → pan target sideways (perpendicular to view)
 *   ty (puck push fore/aft)   → pan target vertically (world up/down)
 *   tz (puck lift)            → zoom (multiply distance, exponential)
 *   rx (puck tilt fore/aft)   → pitch (tilt camera up/down)
 *   ry (puck twist)           → IGNORED — orbit camera has no roll channel
 *   rz (puck turn left/right) → yaw (orbit camera around target)
 *
 * The orbit camera has only 4 degrees of freedom (yaw, pitch, distance,
 * target), so we surface 5 of the 6 SpaceMouse axes. `ry` is dropped —
 * binding it to FOV felt unnatural in playtests, and there's no roll for it
 * to drive.
 *
 * ### Why exponential zoom?
 *
 * Linear zoom (`distance += k * tz * dt`) feels wrong because the same
 * "amount of pull" should mean roughly the same *fractional* change in
 * scale whether you're inspecting a galaxy from 1 Mpc or framing the whole
 * cosmic web from 5000 Mpc. Exponential zoom (`distance *= exp(k * tz * dt)`)
 * gives that scale-invariant feel: the puck always feels the same.
 *
 * The minus convention: pushing the puck DOWN (tz < 0 in our convention,
 * since +tz is "lift") zooms IN. We achieve this by NOT negating tz here
 * and letting positive tz expand distance — but the spec says "negative tz
 * zooms in", so we mirror tz before plugging into exp(). See ZOOM_RATE_PER_MS.
 *
 * ### Why dt-scaled?
 *
 * Display refresh rates vary (60, 120, 144 Hz). Without dt scaling the
 * camera would move twice as fast on a 120 Hz monitor. We multiply each
 * rate constant by the actual frame delta in ms so motion is consistent
 * across refresh rates.
 *
 * ### Pitch clamping
 *
 * `lookAt` produces a degenerate matrix when the camera is directly above
 * or below the target (pitch = ±π/2), because the up-vector becomes
 * parallel to the view direction. We clamp pitch to ±(π/2 − ε) to keep
 * the matrix well-conditioned. Same constraint as the mouse-drag
 * controls in `orbitControls.ts`.
 */

import type { OrbitCamera } from '../@types';
import type { SpaceMouseAxes } from './spaceMouseAxes';

// ─── Tuning constants ─────────────────────────────────────────────────────────
//
// All rates are "per millisecond" so the dt multiplication in `applyAxesToCamera`
// works out to a sensible per-frame increment. They were tuned by feel; see
// the inline comments for the rough per-second target each one targets.

/** Yaw rotation rate at full deflection (rz = 1): about 1.2 rad/sec. */
const YAW_RATE_RAD_PER_MS = 0.0012;

/** Pitch rotation rate at full deflection (rx = 1): about 0.9 rad/sec. */
const PITCH_RATE_RAD_PER_MS = 0.0009;

/**
 * Exponential zoom rate. At full deflection (tz = 1) and dt = 16.6ms (60fps),
 * distance multiplies by exp(0.002 * 1 * 16.6) ≈ 1.034 — a 3.4% increase per
 * frame, or roughly 2× per second. Comfortable for navigation.
 */
const ZOOM_RATE_PER_MS = 0.002;

/**
 * Pan rate as a fraction of the camera's current distance from target.
 * Scaling pan by distance keeps panning feel scale-invariant, just like the
 * exponential zoom: a tiny puck push slides the target by the same on-screen
 * fraction whether you're 1 Mpc out or 5000 Mpc out.
 *
 * At full deflection, dt = 16.6ms: target shifts 0.0015 * 1 * 16.6 = 2.5%
 * of distance per frame — a reasonable fast-pan speed.
 */
const PAN_RATE_PER_MS = 0.0015;

/**
 * Pitch clamp epsilon. Same value used by orbitControls.ts: π/2 minus this
 * gives the maximum allowed pitch magnitude. Larger ε → camera can't get as
 * close to vertical; smaller ε → risks numerical singularities in lookAt.
 */
const PITCH_EPSILON = 0.001;
const PITCH_LIMIT = Math.PI / 2 - PITCH_EPSILON;

// ─── Main entry point ─────────────────────────────────────────────────────────

/**
 * Apply a frame's worth of SpaceMouse input to an orbit camera.
 *
 * Mutates `cam` in place: yaw, pitch, distance, and target may all change.
 * The caller is responsible for invoking `updatePosition(cam)` afterwards
 * to recompute `cam.position` from the new state — we don't import the
 * function here to keep this module pure-state-math (no side effects on
 * other modules' computations).
 *
 * @param cam   The orbit camera to mutate.
 * @param axes  The shaped axes (already through `applyCurve`).
 * @param dtMs  Time elapsed since the last frame, in milliseconds.
 */
export function applyAxesToCamera(
  cam: OrbitCamera,
  axes: SpaceMouseAxes,
  dtMs: number,
): void {
  // ── Yaw (rz: turn left/right) ────────────────────────────────────────────
  //
  // Direct add — yaw wraps freely (no clamp) since 2π is just back where
  // we started. Sign is chosen so a clockwise puck twist (rz > 0) yaws the
  // camera right (the world drifts left), matching most CAD apps' defaults.
  cam.yaw += axes.rz * dtMs * YAW_RATE_RAD_PER_MS;

  // ── Pitch (rx: tilt forward/back) ────────────────────────────────────────
  //
  // Add then clamp to ±(π/2 - ε). Tilting the puck FORWARD (rx > 0) pitches
  // the camera DOWN (the scene tilts up, revealing the floor) — again the
  // common-CAD convention.
  cam.pitch += axes.rx * dtMs * PITCH_RATE_RAD_PER_MS;
  if (cam.pitch > PITCH_LIMIT) cam.pitch = PITCH_LIMIT;
  if (cam.pitch < -PITCH_LIMIT) cam.pitch = -PITCH_LIMIT;

  // ── Zoom (tz: lift/push down) ────────────────────────────────────────────
  //
  // Spec says: negative tz zooms in (puck pushed DOWN → closer view).
  // exp(positive) > 1 expands distance, exp(negative) < 1 shrinks it. So
  // we want distance *= exp(tz * dt * rate) with no negation: positive tz
  // (puck lifted) → exp > 1 → zoom OUT; negative tz (pushed down) → exp < 1
  // → zoom IN. This matches the spec's "negative tz zooms in" sign rule.
  cam.distance *= Math.exp(axes.tz * dtMs * ZOOM_RATE_PER_MS);

  // ── Pan target (tx: sideways, ty: up/down) ───────────────────────────────
  //
  // We need world-space "right" and "up" vectors that are consistent with
  // the camera's current orientation. From the orbit camera math:
  //
  //   forward = (cos(pitch) sin(yaw), sin(pitch), cos(pitch) cos(yaw))
  //
  // (this points from target *toward* camera; flip sign for view direction).
  // The horizontal "right" in the world frame is forward × worldUp; for an
  // orbit camera with worldUp = +Y this simplifies to:
  //
  //   right = (cos(yaw), 0, -sin(yaw))
  //
  // and a "screen up" that stays consistent during pitching:
  //
  //   up = right × view = (-sin(pitch) sin(yaw), cos(pitch), -sin(pitch) cos(yaw))
  //
  // We derive these inline rather than calling gl-matrix helpers to keep the
  // module dependency-free and unit-testable without mocking gl-matrix.
  const cy = Math.cos(cam.yaw);
  const sy = Math.sin(cam.yaw);
  const cp = Math.cos(cam.pitch);
  const sp = Math.sin(cam.pitch);

  const rightX = cy;
  const rightY = 0;
  const rightZ = -sy;

  const upX = -sp * sy;
  const upY = cp;
  const upZ = -sp * cy;

  // Pan magnitude scales with distance — a 1% deflection at 100 Mpc target
  // distance moves the target ~0.0015 Mpc per ms; at 5000 Mpc, ~0.075 Mpc/ms.
  // Same on-screen feel at any zoom level (exactly like the exponential
  // zoom logic above).
  const panScale = cam.distance * PAN_RATE_PER_MS * dtMs;

  // tx pans along right; ty pans along up. Sign convention: pushing the puck
  // RIGHT (tx > 0) drags the target right (world appears to drift left).
  cam.target[0] += (rightX * axes.tx + upX * axes.ty) * panScale;
  cam.target[1] += (rightY * axes.tx + upY * axes.ty) * panScale;
  cam.target[2] += (rightZ * axes.tx + upZ * axes.ty) * panScale;
}

/**
 * Cheap test for whether any axis on a reading is non-zero.
 *
 * Used by the engine to skip the per-frame application path entirely when
 * the puck is at rest — no point spending matrix math on a no-op. We treat
 * exactly zero as "off" because:
 *
 *   - At rest the firmware emits exactly zero (no sensor jitter visible at
 *     int16 resolution).
 *   - The cube curve preserves zero (Math.sign(0) === 0, so 0³ × s = 0).
 */
export function hasAnyAxis(axes: SpaceMouseAxes): boolean {
  return (
    axes.tx !== 0 ||
    axes.ty !== 0 ||
    axes.tz !== 0 ||
    axes.rx !== 0 ||
    axes.ry !== 0 ||
    axes.rz !== 0
  );
}
