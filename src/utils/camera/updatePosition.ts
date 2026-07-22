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
// `scratchDir` holds the frame-local decode; `scratchWorld` holds it rotated
// into world by `frameBasis` (a separate buffer because the matrix–vector
// product reads all three input components while writing the output).
const scratchDir: Vec3 = [0, 0, 0];
const scratchWorld: Vec3 = [0, 0, 0];

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
 * ### Orientation frame
 *
 * `yawPitchToDir` decodes into the camera's *frame-local* space, whose zenith is
 * local +Y. When `cam.frameBasis` is present we rotate that direction into world
 * before placing the eye:  dir_world = frameBasis · dir_local. Absent a basis the
 * decode already IS world space, so the path stays exactly the pre-feature
 * `yawPitchToDir` → `addScaled` two-liner (byte-identical for every caller that
 * never sets a frame).
 *
 * The registry `Mat3` is a TIGHT 9-float column-major tuple (columns at flat
 * indices 0–2, 3–5, 6–8). wgpu-matrix's `vec3.transformMat3` instead expects the
 * vec4-PADDED 12-float layout (columns at 0, 4, 8) that WGSL's `mat3x3` uses, so
 * feeding it the tight array would read garbage. Rather than maintain a second
 * padded copy of the basis in this hot path, we do the column-major matrix–vector
 * product inline over the tight tuple — three multiply-adds, allocation-free, and
 * one layout in play instead of two.
 *
 * @param cam  The camera to update in-place.
 */
export function updatePosition(cam: OrbitCamera): void {
  // Unit direction from target toward camera in frame-local space, written into
  // the module scratch so the per-frame path stays allocation-free.
  const dir = yawPitchToDir(cam.yaw, cam.pitch, scratchDir);

  const basis = cam.frameBasis;
  if (basis !== undefined) {
    // dir_world = basis · dir_local. Tight column-major: cell (row r, col c) is
    // at basis[c*3 + r], so column c contributes basis[c*3 + 0..2] scaled by the
    // matching input component.
    const x = dir[0];
    const y = dir[1];
    const z = dir[2];
    scratchWorld[0] = basis[0] * x + basis[3] * y + basis[6] * z;
    scratchWorld[1] = basis[1] * x + basis[4] * y + basis[7] * z;
    scratchWorld[2] = basis[2] * x + basis[5] * y + basis[8] * z;
    vec3.addScaled(cam.target, scratchWorld, cam.distance, cam.position);
    return;
  }

  // No frame: the decode is already world space. position = target + distance*dir
  // vec3.addScaled(a, b, scale, dst) computes  dst = a + b*scale.
  vec3.addScaled(cam.target, dir, cam.distance, cam.position);
}
