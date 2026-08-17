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

import { mat4 } from 'wgpu-matrix';
import type { Mat4 } from 'wgpu-matrix';
import type { OrbitCamera } from '../../@types/camera/OrbitCamera';
import type { Vec3 } from '../../@types/math/Vec3';
import type { ImagePlaneBasis } from '../../@types/camera/ImagePlaneBasis';
import { imagePlaneBasis } from './imagePlaneBasis';
import { frameUp } from './frameUp';

// Module-scope scratch reused every frame: the forward view direction, the
// frame-pole reference up, and the roll-adjusted basis. computeViewProj runs
// once per frame on the render hot path, so all three are hoisted out of the
// function to avoid per-call allocation.
const forwardScratch: Vec3 = [0, 0, 0];
const upRefScratch: Vec3 = [0, 0, 0];
const basisScratch: ImagePlaneBasis = { rolledUp: [0, 0, 0], right: [0, 0, 0], up: [0, 0, 0] };

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
 * ### Projection matrix — `mat4.perspective`
 *
 * wgpu-matrix's `mat4.perspective` maps the view frustum to clip-space depth
 * **[0, 1]** — the WebGPU / Direct3D / Metal convention ("Zero to One") — by
 * default.  That matches WebGPU's NDC depth range directly, so there is no
 * separate "ZO vs NO" choice to make (unlike gl-matrix, which defaulted to the
 * OpenGL [−1, +1] range and required calling `perspectiveZO` explicitly).
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
 * @returns A new `Mat4` representing the combined view-projection transform.
 */
export function computeViewProj(cam: OrbitCamera): Mat4 {
  // ── View matrix ──────────────────────────────────────────────────────────
  //
  // `lookAt` needs an "up" vector.  By default this is world +Y, which works
  // for any camera position that isn't exactly on the +Y or −Y pole (hence
  // the pitch-clamp in the controls module).  When `cam.roll` is non-zero the
  // up-vector is rotated about the view direction; `imagePlaneBasis` owns that
  // roll convention (Rodrigues' formula), and we hand its `rolledUp` result to
  // `lookAt`. The base up is the frame pole (`frameUp` reads `cam.upBasis` —
  // draw-time, so it may be a transient mid-slerp basis, unlike the decode's
  // `poseBasis`); absent a basis that is world +Y, so the pre-frame camera is
  // unchanged.
  //
  // `forward` is the unit view direction (target − position). `imagePlaneBasis`
  // needs it as a required argument even when roll is zero (it also determines
  // the frame-pole projection for the base up-vector), so we always build it
  // here — a subtract + normalize into module scratch, no allocation.
  const tgt = cam.target as Vec3;
  const fx = tgt[0] - cam.position[0];
  const fy = tgt[1] - cam.position[1];
  const fz = tgt[2] - cam.position[2];
  const flen = Math.hypot(fx, fy, fz) || 1;
  forwardScratch[0] = fx / flen;
  forwardScratch[1] = fy / flen;
  forwardScratch[2] = fz / flen;
  const basis = imagePlaneBasis(
    forwardScratch,
    cam.roll ?? 0,
    frameUp(cam.upBasis, upRefScratch),
    basisScratch,
  );

  // wgpu-matrix ops take the destination as an optional LAST argument and
  // return it.  Omitting it allocates a fresh Mat4 (Float32Array) — same
  // allocation behaviour as the previous `mat4.create()` + write-into-dst.
  const view = mat4.lookAt(
    cam.position, // eye: where the camera is
    cam.target, // center: what the camera looks at
    basis.rolledUp, // up: world +Y by default; rotated by roll when non-zero
    // ⚠ If pitch = ±π/2, `position` is directly above/below `target` and
    // the default up vector is parallel to the view direction.  lookAt
    // produces a degenerate matrix in that case.  The controls module
    // prevents this by clamping pitch to ±(π/2 − ε).
  );

  // ── Projection matrix ────────────────────────────────────────────────────
  // mat4.perspective: depth maps to [0, 1] by default — required for WebGPU.
  const proj = mat4.perspective(cam.fovYRad, cam.aspect, cam.near, cam.far);

  // ── Combined view-projection ─────────────────────────────────────────────
  // mat4.multiply(a, b) computes a * b.
  // Reading right-to-left: view is applied first, then projection.
  const vp = mat4.multiply(proj, view);
  return vp;
}
