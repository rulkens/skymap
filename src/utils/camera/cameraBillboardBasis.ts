/**
 * cameraBillboardBasis — world-space right/up axes of the camera's image
 * plane, for expanding billboard sprites (point-cloud stars/dust) so they
 * always face the viewer.
 *
 *   OrbitCamera state  →  (this module)  →  { right, up } world-space axes
 *
 * A billboard quad is built by offsetting a point's world position along
 * `right` and `up` by half its screen-space size — the same two axes that
 * `mat4.lookAt` derives internally to build the view matrix's rotation.
 * This module recomputes them explicitly rather than reading them back out
 * of a `Mat4`, because the cloud shaders need `right`/`up` as plain vectors
 * to bake into an instanced vertex buffer, not as a 4×4 matrix to invert.
 *
 * ### The roll convention and the right/up formulas
 *
 * The roll-adjusted up vector and the screen right/up axes it induces are
 * shared with `computeViewProj` through `imagePlaneBasis` — the single home
 * for that math, so the roll convention lives in one place. This module hands
 * it the camera's forward direction and roll, then exposes the `right`/`up`
 * axes it returns:
 *
 *   forward = normalize(target - position)
 *   right   = normalize(forward × up_rolled)
 *   up      = normalize(right × forward)
 *
 * These are the same cross products `mat4.lookAt` computes internally to build
 * its rotation (verified algebraically: lookAt's `z = normalize(eye - target)`
 * is `-forward`, so its `x = normalize(cross(up, z))` reduces to
 * `normalize(cross(forward, up))`, and its `y = cross(z, x)` reduces to
 * `cross(right, forward)`).
 *
 * Pure: free of browser or WebGPU dependencies so it can be tested in a
 * plain Node/Vitest environment.
 */

import type { OrbitCamera } from '../../@types/camera/OrbitCamera';
import type { Vec3 } from '../../@types/math/Vec3';
import { imagePlaneBasis } from './imagePlaneBasis';
import { frameUp } from './frameUp';

// The reference up rolled about the view direction is the frame pole. Module
// scratch reused each call — `imagePlaneBasis` only reads it, never retains it.
const upRefScratch: Vec3 = [0, 0, 0];

/**
 * Compute the world-space right/up axes of the given camera's image plane.
 *
 * @param cam  The orbit camera whose eye/target/roll to derive the basis from.
 * @returns Unit-length `right` and `up` vectors, mutually orthogonal and
 *          both orthogonal to the camera's forward (view) direction.
 */
export function cameraBillboardBasis(cam: OrbitCamera): { right: Vec3; up: Vec3 } {
  // ── forward: unit vector from the camera toward its target ─────────────
  const fx = cam.target[0] - cam.position[0];
  const fy = cam.target[1] - cam.position[1];
  const fz = cam.target[2] - cam.position[2];
  const flen = Math.hypot(fx, fy, fz) || 1;
  const forward: Vec3 = [fx / flen, fy / flen, fz / flen];

  // `imagePlaneBasis` rolls the frame pole (`frameUp(cam.upBasis)`; world +Y
  // absent a basis) about `forward` and derives the screen right/up axes. Reads
  // `upBasis`, not `poseBasis` — this is a draw-time up-vector, free to track a
  // transient mid-slerp basis (see `OrbitCameraInit.d.ts`). We omit its `out`
  // argument so it allocates a fresh basis — the returned `right`/`up` are
  // freshly-allocated vectors callers may retain, matching this function's
  // long-standing contract.
  const basis = imagePlaneBasis(forward, cam.roll ?? 0, frameUp(cam.upBasis, upRefScratch));
  return { right: basis.right, up: basis.up };
}
