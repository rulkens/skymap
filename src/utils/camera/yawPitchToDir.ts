/**
 * yawPitchToDir — decode the orbit-camera convention's (yaw, pitch) into the
 * unit world direction pointing FROM the target TOWARD the eye.
 *
 * This is the pure spherical-to-Cartesian core shared by every site that turns
 * a bearing into a direction: `updatePosition` (eye = target + distance·dir),
 * the follow camera, and the tour path aim. Those sites used to inline the same
 * four trig calls; extracting them here makes the convention live in ONE place,
 * so the later orientation-frame switch has a single formula to reroute instead
 * of a scattered handful that can silently drift apart.
 *
 * ### The math
 *
 * A **right-handed, Y-up** frame where yaw=0, pitch=0 is the +Z axis:
 *
 *     dir.x = cos(pitch) · sin(yaw)   ← east/west spread scaled by cos(pitch)
 *     dir.y = sin(pitch)               ← vertical component
 *     dir.z = cos(pitch) · cos(yaw)   ← north/south spread scaled by cos(pitch)
 *
 * At yaw=0, pitch=0:  dir = [0, 0, 1] (+Z). `cos(pitch)` is the "horizontal
 * radius" that shrinks toward the poles, keeping the total length = 1.
 *
 * The alternative — a `mat4` rotation of a base vector — would pull in a matrix
 * dependency and allocate, for a formula that is three multiplies and four trig
 * calls in place. The direct decode keeps this runnable in plain Node/Vitest
 * with no browser or WebGPU surface.
 *
 * @param yaw    Bearing around the Y axis (radians); yaw=0 faces +Z.
 * @param pitch  Elevation above the XZ plane (radians); pitch=+π/2 faces +Y.
 * @param out    Optional destination written in place and returned; a fresh
 *               `Vec3` is allocated when omitted.
 */

import type { Vec3 } from '../../@types/math/Vec3';

export function yawPitchToDir(yaw: number, pitch: number, out?: Vec3): Vec3 {
  const cp = Math.cos(pitch); // horizontal-plane scale factor
  const sp = Math.sin(pitch); // vertical (Y) component
  const cy = Math.cos(yaw); // Z component (at pitch=0, yaw=0 → Z=1)
  const sy = Math.sin(yaw); // X component (at pitch=0, yaw=π/2 → X=1)

  const dir = out ?? ([0, 0, 0] as Vec3);
  dir[0] = cp * sy;
  dir[1] = sp;
  dir[2] = cp * cy;
  return dir;
}
