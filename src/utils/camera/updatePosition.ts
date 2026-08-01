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
import { rotateVec3ByTightMat3 } from '../math/rotateVec3ByTightMat3';

// Module-scope scratch reused every call so the per-frame path never allocates.
// `scratchDir` holds the frame-local decode; `scratchWorld` holds it rotated
// into world by `poseBasis` (a separate buffer because the matrix–vector
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
 * local +Y. `rotateVec3ByTightMat3` rotates that direction into world by
 * `cam.poseBasis` (dir_world = poseBasis · dir_local), or passes it through
 * unchanged when no basis is set — see that module for why the registry's
 * TIGHT 9-float `Mat3` can't go through wgpu-matrix's `vec3.transformMat3`.
 * Absent a basis the path stays exactly the pre-feature `yawPitchToDir` →
 * `addScaled` two-liner (byte-identical for every caller that never sets a
 * frame). Deliberately `poseBasis`, not `upBasis`: this decode must stay
 * pinned to the steady committed frame even while `upBasis` mid-slerps during
 * an orientation switch (see `OrbitCameraInit.d.ts`).
 *
 * @param cam  The camera to update in-place.
 */
export function updatePosition(cam: OrbitCamera): void {
  // Unit direction from target toward camera in frame-local space, then
  // rotated into world — both written into module scratch so the per-frame
  // path stays allocation-free.
  const dir = yawPitchToDir(cam.yaw, cam.pitch, scratchDir);
  const world = rotateVec3ByTightMat3(dir, cam.poseBasis, scratchWorld);
  // position = target + distance*world. vec3.addScaled(a, b, scale, dst)
  // computes  dst = a + b*scale.
  vec3.addScaled(cam.target, world, cam.distance, cam.position);
}
