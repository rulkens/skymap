/**
 * CameraTween — a single in-flight camera tween descriptor.
 *
 * A frozen "from → to" plan that the engine advances each frame using
 * `performance.now()` as the wall clock.  All `from*` fields are captured
 * at the moment the tween is created, so interrupting a running tween
 * with a new one always starts smoothly from the *current* camera state,
 * never the original starting state.
 *
 * The state machine that consumes this descriptor lives in
 * `src/services/camera/cameraTween.ts` (`advanceCameraTween`).
 */

import type { vec3 } from 'gl-matrix';

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
