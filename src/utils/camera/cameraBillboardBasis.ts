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
 * ### Why this mirrors `computeViewProj.ts` instead of importing from it
 *
 * `computeViewProj` inlines its roll-adjusted up-vector (Rodrigues'
 * rotation formula, see the block starting at its `const roll = cam.roll`
 * line) as a local step on the way to building a view matrix — it was never
 * a standalone, callable "give me the rolled up vector" function. Carving
 * one out would mean threading an extra return value through the hottest
 * per-frame matrix-build path in the renderer for a consumer
 * (`cameraBillboardBasis`) that only exists for the point-cloud pass. The
 * roll math itself is exactly the derivation documented there — copied
 * here verbatim rather than factored out, so a change to one must be
 * checked against the other (both are covered by roll-basis tests: this
 * file's and `orbitCamera.test.ts`'s `roll=π/2` case).
 *
 * ### The right/up formulas
 *
 * These are the same cross products `mat4.lookAt` computes internally to
 * build its rotation (verified algebraically: lookAt's `z = normalize(eye
 * - target)` is `-forward`, so its `x = normalize(cross(up, z))` reduces to
 * `normalize(cross(forward, up))`, and its `y = cross(z, x)` reduces to
 * `cross(right, forward)` — exactly the two lines below):
 *
 *   forward = normalize(target - position)
 *   right   = normalize(forward × up_rolled)
 *   up      = right × forward
 *
 * Pure: free of browser or WebGPU dependencies so it can be tested in a
 * plain Node/Vitest environment.
 */

import type { OrbitCamera } from '../../@types/camera/OrbitCamera';
import type { Vec3 } from '../../@types/math/Vec3';

/**
 * Compute the world-space right/up axes of the given camera's image plane.
 *
 * @param cam  The orbit camera whose eye/target/roll to derive the basis from.
 * @returns Unit-length `right` and `up` vectors, mutually orthogonal and
 *          both orthogonal to the camera's forward (view) direction.
 */
export function cameraBillboardBasis(cam: OrbitCamera): { right: Vec3; up: Vec3 } {
  // ── forward: unit vector from the camera toward its target ─────────────
  let fx = cam.target[0] - cam.position[0];
  let fy = cam.target[1] - cam.position[1];
  let fz = cam.target[2] - cam.position[2];
  const flen = Math.hypot(fx, fy, fz) || 1;
  fx /= flen;
  fy /= flen;
  fz /= flen;

  // ── up_rolled: world +Y rotated about `forward` by cam.roll ────────────
  // Identical derivation to computeViewProj.ts's roll block — see this
  // file's header for why the math is copied rather than shared. For
  // roll = 0 the Rodrigues formula collapses to v_rot = v, so we early-exit
  // to the world-up default exactly as computeViewProj.ts does.
  const roll = cam.roll ?? 0;
  let upX = 0;
  let upY = 1;
  let upZ = 0;
  if (Number.isFinite(roll) && roll !== 0) {
    // k = unit view-direction axis = forward (already normalised above).
    const kx = fx;
    const ky = fy;
    const kz = fz;
    const c = Math.cos(roll);
    const s = Math.sin(roll);
    // v = (0, 1, 0); k · v = ky; k × v = (kz, 0, −kx)
    const dot = ky;
    const crossX = kz;
    const crossY = 0;
    const crossZ = -kx;
    upX = 0 * c + crossX * s + kx * dot * (1 - c);
    upY = 1 * c + crossY * s + ky * dot * (1 - c);
    upZ = 0 * c + crossZ * s + kz * dot * (1 - c);
  }

  // ── right = normalize(forward × up_rolled) ──────────────────────────────
  let rx = fy * upZ - fz * upY;
  let ry = fz * upX - fx * upZ;
  let rz = fx * upY - fy * upX;
  const rlen = Math.hypot(rx, ry, rz) || 1;
  rx /= rlen;
  ry /= rlen;
  rz /= rlen;

  // ── up = right × forward ────────────────────────────────────────────────
  // Already unit length (cross of two orthogonal unit vectors), but we
  // renormalise defensively against floating-point drift — same guard
  // orbitControls.ts's pan handler applies to its own right/up basis.
  let ux = ry * fz - rz * fy;
  let uy = rz * fx - rx * fz;
  let uz = rx * fy - ry * fx;
  const ulen = Math.hypot(ux, uy, uz) || 1;
  ux /= ulen;
  uy /= ulen;
  uz /= ulen;

  return { right: [rx, ry, rz], up: [ux, uy, uz] };
}
