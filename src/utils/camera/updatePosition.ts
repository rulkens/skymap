/**
 * updatePosition — derive an orbit camera's world-space position from its
 * spherical state (yaw, pitch, distance, target).
 *
 * This is the heart of the orbit-camera math: a right-handed, Y-up
 * spherical-to-Cartesian conversion. It is intentionally free of any browser
 * or WebGPU dependency so it can run in a plain Node/Vitest environment.
 */

import type { OrbitCamera } from '../../@types/camera/OrbitCamera';
import { eyeMpcOf } from './eyeMpcOf';

/**
 * Recompute `cam.position` from the current yaw, pitch, distance, and target.
 *
 * Call this every time you mutate `cam.yaw`, `cam.pitch`, `cam.distance`, or
 * `cam.target`.  Typically the controls module calls this after processing a
 * mouse or touch event.
 *
 * ### The math
 *
 * `eyeMpcOf` owns the whole derivation (frame-local (yaw, pitch) decode, rotate
 * by the steady `poseBasis`, `target + distance · dir`) so the regime predicate
 * and this camera read one eye, not two. `cam.position` is passed as its `out`
 * to keep this per-frame path allocation-free.
 *
 * @param cam  The camera to update in-place.
 */
export function updatePosition(cam: OrbitCamera): void {
  eyeMpcOf(cam, cam.poseBasis, cam.position);
}
