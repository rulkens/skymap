/**
 * updatePosition — derive an orbit camera's world-space position from its
 * spherical state (yaw, pitch, distance, target).
 *
 * This is the heart of the orbit-camera math: a right-handed, Y-up
 * spherical-to-Cartesian conversion. It is intentionally free of any browser
 * or WebGPU dependency so it can run in a plain Node/Vitest environment.
 */

import { vec3 } from 'wgpu-matrix';
import type { OrbitCamera } from '../../@types/camera/OrbitCamera';
import type { Vec3 } from '../../@types/math/Vec3';
import { yawPitchToDir } from './yawPitchToDir';

// Module-scope scratch reused every call so the per-frame path never allocates.
const scratchDir: Vec3 = [0, 0, 0];

/**
 * Recompute `cam.position` from the current yaw, pitch, distance, and target.
 *
 * Call this every time you mutate `cam.yaw`, `cam.pitch`, `cam.distance`, or
 * `cam.target`.  Typically the controls module calls this after processing a
 * mouse or touch event.
 *
 * ### The math
 *
 * The (yaw, pitch) → unit direction decode lives in `yawPitchToDir` (the shared
 * spherical-to-Cartesian core). Here we simply place the eye along that
 * direction:  position = target + distance · dir.
 *
 * (This is `vec3.addScaled`: dst = a + b*scale.)
 *
 * @param cam  The camera to update in-place.
 */
export function updatePosition(cam: OrbitCamera): void {
  // Unit direction from target toward camera in world space, written into the
  // module scratch so the per-frame path stays allocation-free.
  const dir = yawPitchToDir(cam.yaw, cam.pitch, scratchDir);

  // position = target + distance * dir
  // vec3.addScaled(a, b, scale, dst) computes  dst = a + b*scale.
  vec3.addScaled(cam.target, dir, cam.distance, cam.position);
}
