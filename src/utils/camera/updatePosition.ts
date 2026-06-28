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

/**
 * Recompute `cam.position` from the current yaw, pitch, distance, and target.
 *
 * Call this every time you mutate `cam.yaw`, `cam.pitch`, `cam.distance`, or
 * `cam.target`.  Typically the controls module calls this after processing a
 * mouse or touch event.
 *
 * ### The math
 *
 * We convert spherical coordinates (r = distance, θ = yaw, φ = pitch) to
 * Cartesian using a **right-handed, Y-up** frame where yaw=0, pitch=0 is
 * the +Z axis:
 *
 *     dir.x = cos(pitch) · sin(yaw)   ← east/west spread scaled by cos(pitch)
 *     dir.y = sin(pitch)               ← vertical component
 *     dir.z = cos(pitch) · cos(yaw)   ← north/south spread scaled by cos(pitch)
 *
 * At yaw=0, pitch=0:
 *   dir = [0, 0, 1]  → camera is at target + distance·ẑ, which is +Z.
 *
 * `cos(pitch)` acts as a "horizontal radius" that shrinks as the camera
 * tilts toward the poles, keeping the total length = 1.
 *
 * Finally:  position = target + distance · dir
 *
 * (This is `vec3.addScaled`: dst = a + b*scale.)
 *
 * @param cam  The camera to update in-place.
 */
export function updatePosition(cam: OrbitCamera): void {
  const cp = Math.cos(cam.pitch); // horizontal-plane scale factor
  const sp = Math.sin(cam.pitch); // vertical (Y) component
  const cy = Math.cos(cam.yaw); // Z component (at pitch=0, yaw=0 → Z=1)
  const sy = Math.sin(cam.yaw); // X component (at pitch=0, yaw=π/2 → X=1)

  // Unit direction vector from target toward camera in world space.
  // Follows the spherical-to-Cartesian formula described above.
  const dir = vec3.fromValues(cp * sy, sp, cp * cy);

  // position = target + distance * dir
  // vec3.addScaled(a, b, scale, dst) computes  dst = a + b*scale.
  vec3.addScaled(cam.target, dir, cam.distance, cam.position);
}
