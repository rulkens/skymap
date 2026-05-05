/**
 * cameraTween — pure state machine that drives an OrbitCamera from a
 * captured "from" snapshot to a "to" snapshot over a fixed duration.
 *
 * ### Why a separate module?
 *
 * The render loop in `engine.ts` already does enough — adding a multi-channel
 * tween calculation inline would bury the logic and make it untestable
 * without spinning up a WebGPU device. By extracting the pure math here we
 * get:
 *
 *   1. Vitest coverage of the easing, the shortest-arc yaw, and the boundary
 *      conditions (t=0, t=1, t>1) — none of which require a GPU.
 *   2. A clear contract: `advanceCameraTween` is the *only* function the
 *      engine calls per frame; if the tween is non-null the engine just
 *      forwards `(cam, tween, performance.now())` and reads the boolean
 *      return value to decide whether to clear `currentTween`.
 *
 * ### Single in-flight tween policy
 *
 * Engine state holds at most one `CameraTween` at a time.  Starting a new
 * tween (focus on a different galaxy, or interrupting with home) snapshots
 * the *current* camera state into the new tween's `from*` fields and
 * replaces the running tween.  This keeps motion continuous — no jumps,
 * no queued backlog, no fight between two tweens for the same camera.
 *
 * ### Channels we tween
 *
 *   - target    (vec3)  — pivot point of the orbit
 *   - distance  (number) — radius
 *   - yaw       (radians, shortest-arc)
 *   - pitch     (radians, scalar lerp — pitch is clamped, never wraps)
 *
 * fovYRad / aspect / near / far do NOT tween.  They aren't camera *pose*;
 * they are projection settings tied to the canvas size and lens.
 */

import { vec3 } from 'gl-matrix';
import type { OrbitCamera } from '../../@types';
import { updatePosition } from './orbitCamera';
import { easeOutCubic } from '../../utils/math/easeOutCubic';
import { lerp } from '../../utils/math/lerp';
import { lerpAngleShortest } from '../../utils/math/lerpAngleShortest';

/**
 * A single in-flight camera tween — a frozen "from → to" plan that the
 * engine advances each frame using `performance.now()` as the wall clock.
 *
 * All `from*` fields are captured at the moment the tween is created, so
 * interrupting a running tween with a new one always starts smoothly from
 * the *current* camera state, never the original starting state.
 */
export type CameraTween = {
  /** `performance.now()` value at the moment the tween was created. */
  startMs: number;
  /** Total tween duration in milliseconds (we use 600 throughout the app). */
  durationMs: number;

  /** Camera target at tween start.  Captured once; never mutated. */
  fromTarget: vec3;
  /** Camera target at tween end. */
  toTarget: vec3;

  /** Camera distance (radius) at tween start. */
  fromDistance: number;
  /** Camera distance at tween end. */
  toDistance: number;

  /** Camera yaw (radians) at tween start. */
  fromYaw: number;
  /** Camera yaw at tween end. */
  toYaw: number;

  /** Camera pitch (radians) at tween start. */
  fromPitch: number;
  /** Camera pitch at tween end. */
  toPitch: number;
};

/**
 * Advance the tween by writing the eased intermediate state into `cam`.
 *
 * The function does NOT track its own progress; the caller passes in the
 * current wall-clock time (`performance.now()` in the browser, an injected
 * value in tests).  This makes the function pure with respect to time and
 * trivially testable.
 *
 * ### Saturation behaviour
 *
 * If `nowMs` is past the deadline, the camera is snapped exactly to the
 * `to*` values and the function returns `true`.  This matters because
 * `easeOutCubic` clamps its input — without the explicit deadline check
 * a tween whose first frame happens to land past `startMs + durationMs`
 * (e.g. a paused tab waking up) would still produce a meaningful "land on
 * target" frame, but the engine wouldn't know to clear `currentTween`.
 *
 * @param cam   The camera to mutate in-place.
 * @param tween The tween descriptor.
 * @param nowMs Current wall-clock time, in ms (typically `performance.now()`).
 * @returns     `true` if the tween has completed (caller should drop it),
 *              `false` if the tween is still in progress.
 */
export function advanceCameraTween(cam: OrbitCamera, tween: CameraTween, nowMs: number): boolean {
  // Linear progress in [0, 1+].  We clamp at 1 (saturate the tween) and use
  // the clamp to detect "finished".
  const rawT = (nowMs - tween.startMs) / tween.durationMs;
  const finished = rawT >= 1;
  const linearT = finished ? 1 : Math.max(0, rawT);

  // Apply easing to the linear progress.  easeOutCubic is its own clamp, but
  // we already clamped above — passing a known-clean value is just clearer.
  const t = easeOutCubic(linearT);

  // ── Target (vec3 lerp) ────────────────────────────────────────────────
  // We mutate cam.target in place rather than allocating; the orbit camera
  // type stores target as a `[number, number, number]` tuple under the hood
  // (see OrbitCameraInit) and updatePosition reads it directly.
  cam.target[0] = lerp(tween.fromTarget[0], tween.toTarget[0], t);
  cam.target[1] = lerp(tween.fromTarget[1], tween.toTarget[1], t);
  cam.target[2] = lerp(tween.fromTarget[2], tween.toTarget[2], t);

  // ── Distance (scalar lerp) ────────────────────────────────────────────
  cam.distance = lerp(tween.fromDistance, tween.toDistance, t);

  // ── Yaw (shortest-arc angle lerp) ─────────────────────────────────────
  // Yaw can be any real number after extended dragging; we always want to
  // sweep the short way around the circle.  See lerpAngleShortest docstring.
  cam.yaw = lerpAngleShortest(tween.fromYaw, tween.toYaw, t);

  // ── Pitch (scalar lerp; pitch is clamped, never wraps) ────────────────
  cam.pitch = lerp(tween.fromPitch, tween.toPitch, t);

  // Recompute world-space position from the new spherical state.  Same
  // contract as the orbit-controls module: any time you mutate yaw/pitch/
  // distance/target, call updatePosition before the next render.
  updatePosition(cam);

  return finished;
}
