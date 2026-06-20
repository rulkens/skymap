/**
 * computeViewProj — snapshot an orbit camera's state into a combined
 * view-projection matrix for the GPU.
 *
 *   OrbitCamera state  →  (this module)  →  viewProj mat4
 *   viewProj mat4      →  vertex shader  →  clip-space position
 *
 * Pure: free of browser or WebGPU dependencies so it can be tested in a
 * plain Node/Vitest environment.
 */

import { mat4, vec3 } from 'gl-matrix';
import type { OrbitCamera } from '../../@types/camera/OrbitCamera';
import type { Vec3 } from '../../@types/math/Vec3';

/**
 * Compute the combined view-projection matrix for the given camera state.
 *
 * Returns a `mat4` ready to upload to a GPU uniform buffer.  Multiply a
 * world-space position `p` (as `vec4`) by this matrix to get its clip-space
 * position:
 *
 *     clipPos = viewProj * worldPos
 *
 * ### View matrix — `mat4.lookAt`
 *
 * `lookAt(eye, center, up)` places the camera at `eye`, aiming at `center`,
 * with the world +Y axis as "up".  The result is a rotation + translation
 * that transforms world-space coordinates into *camera space* (sometimes
 * called "eye space"):
 *
 *   - Camera sits at the origin.
 *   - −Z points *into* the scene (toward `center`).
 *   - +Y aligns with the world-up projected onto the image plane.
 *
 * ### Projection matrix — `mat4.perspectiveZO` (not `perspectiveNO`)
 *
 * gl-matrix offers two perspective variants:
 *
 *   - `perspectiveNO` — maps the view frustum to clip-space depth **[−1, +1]**
 *     (OpenGL convention, "Normalized range from Negative to pOsitive one").
 *   - `perspectiveZO` — maps the view frustum to clip-space depth **[0, 1]**
 *     (WebGPU / Direct3D / Metal convention, "Zero to One").
 *
 * WebGPU's NDC (Normalised Device Coordinates) uses the [0, 1] depth range.
 * Using `perspectiveNO` would map depths to [−1, +1] in clip space, but the
 * hardware would then interpret those values against a [0, 1] depth buffer,
 * effectively discarding half the frustum and inverting depth comparisons.
 * The result is objects that disappear or z-fight incorrectly.  Always use
 * `perspectiveZO` for WebGPU.
 *
 * ### Multiplication order — `proj * view`
 *
 * gl-matrix stores matrices in **column-major** order (same as GLSL and WGSL).
 * In column-major convention, vectors are column vectors and the transform
 * chain is read right-to-left:
 *
 *     clipPos = (proj * view) * worldPos
 *               ↑ applied last   ↑ applied first
 *
 * So `mat4.multiply(vp, proj, view)` computes `proj * view`, applying the
 * view transform first (world → camera) and the projection second (camera →
 * clip).  This is the standard MVP formula with M = Identity.
 *
 * @param cam  The orbit camera whose state to snapshot into matrices.
 * @returns A new `mat4` representing the combined view-projection transform.
 */
export function computeViewProj(cam: OrbitCamera): mat4 {
  // ── View matrix ──────────────────────────────────────────────────────────
  //
  // We need an "up" vector for `lookAt`.  By default this is world +Y, which
  // works for any camera position that isn't exactly on the +Y or −Y pole
  // (hence the pitch-clamp in the controls module).
  //
  // When `cam.roll` is non-zero we rotate that up-vector around the view
  // direction (target − position) using Rodrigues' rotation formula:
  //
  //   v_rot = v·cosθ  +  (k×v)·sinθ  +  k·(k·v)·(1−cosθ)
  //
  // where k is the *unit* view-direction axis and θ is the roll angle.
  //
  // For roll = 0 the formula collapses to v_rot = v (cosθ = 1, sinθ = 0,
  // last term = 0), so the no-roll path is algebraically identical — we use
  // an early-exit for performance and clarity.
  //
  // With v = (0, 1, 0):
  //   k · v = ky           (dot product)
  //   k × v = (kz, 0, −kx) (cross product — note the zero middle component)
  //
  // This expansion is inlined to stay dependency-free (no additional
  // gl-matrix imports beyond what was already present).
  const roll = cam.roll ?? 0;
  let upX = 0;
  let upY = 1;
  let upZ = 0;
  if (Number.isFinite(roll) && roll !== 0) {
    // k = unit vector from position toward target (the view direction axis)
    const tgt = cam.target as Vec3;
    let kx = tgt[0] - cam.position[0];
    let ky = tgt[1] - cam.position[1];
    let kz = tgt[2] - cam.position[2];
    const klen = Math.hypot(kx, ky, kz) || 1;
    kx /= klen;
    ky /= klen;
    kz /= klen;
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

  const view = mat4.create();
  mat4.lookAt(
    view,
    cam.position, // eye: where the camera is
    cam.target as vec3, // center: what the camera looks at
    [upX, upY, upZ], // up: world +Y by default; rotated by roll when non-zero
    // ⚠ If pitch = ±π/2, `position` is directly above/below `target` and
    // the default up vector is parallel to the view direction.  lookAt
    // produces a degenerate matrix in that case.  The controls module
    // prevents this by clamping pitch to ±(π/2 − ε).
  );

  // ── Projection matrix ────────────────────────────────────────────────────
  const proj = mat4.create();
  // perspectiveZO: depth maps to [0, 1] — required for WebGPU.
  mat4.perspectiveZO(proj, cam.fovYRad, cam.aspect, cam.near, cam.far);

  // ── Combined view-projection ─────────────────────────────────────────────
  const vp = mat4.create();
  // mat4.multiply(out, a, b) computes out = a * b.
  // Reading right-to-left: view is applied first, then projection.
  mat4.multiply(vp, proj, view);
  return vp;
}
