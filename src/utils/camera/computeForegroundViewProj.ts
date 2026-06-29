/**
 * computeForegroundViewProj — build the f64 view-projection matrix for the
 * foreground pass, relative to a `renderOrigin` anchor point.
 *
 *   (eye, target, renderOrigin, frustum params)  →  (this module)  →  f64 viewProj mat4
 *   f64 viewProj mat4  →  per-object MVP compose  →  GPU vertex buffer
 *
 * ### Why f64?
 *
 * Near-Earth rendering requires sub-metre accuracy at cosmological scales
 * (eye positions on the order of 1 AU ≈ 4.8×10⁻⁹ Mpc). A Float32Array matrix
 * built from those coordinates loses the low-order bits of the translation
 * before the shader ever runs. By computing in f64 (`mat4d`) we retain ~15
 * significant decimal digits — enough for submetre precision anywhere in the
 * observable universe. The matrix is narrowed to f32 only at the GPU-upload
 * boundary (see `narrowMat4`), so the full precision is available for every
 * intermediate composition step.
 *
 * ### renderOrigin-relative subtraction
 *
 * To avoid catastrophic cancellation in the view translation, we subtract
 * `renderOrigin` from both `eye` and `target` in f64 BEFORE calling `lookAt`.
 * This keeps the numbers small: eye−origin and target−origin are always within
 * a few Mpc of the origin regardless of where the camera sits in world space.
 * The resulting view matrix is expressed in origin-relative coordinates, so
 * per-object model matrices must also be expressed relative to `renderOrigin`
 * for the MVP product to be correct.
 *
 * `up` is not translated — it is a direction vector, not a world-space point.
 *
 * ### View matrix — `mat4d.lookAt`
 *
 * Same semantics as `mat4.lookAt` (f32 counterpart in `computeViewProj`):
 * places the camera at `eye − renderOrigin`, aiming at `target − renderOrigin`,
 * with `up` as the image-plane up direction.  The result transforms
 * origin-relative world coordinates into camera space.
 *
 * ### Projection matrix — `mat4d.perspective`
 *
 * `mat4d.perspective` maps the view frustum to clip-space depth **[0, 1]** by
 * default — the WebGPU Zero-to-One convention.  This is identical to
 * `mat4.perspective` in the f32 path; no separate ZO call is needed.
 *
 * ### Multiplication order — `proj * view`
 *
 * wgpu-matrix uses column-major storage (same as WGSL).  Vectors are column
 * vectors; the transform chain reads right-to-left:
 *
 *     clipPos = (proj * view) * modelPos
 *               ↑ applied last   ↑ applied first
 *
 * `mat4d.multiply(proj, view)` computes `proj * view`, applying view first
 * (origin-relative world → camera) then projection (camera → clip).
 *
 * ### Return value
 *
 * Returns the raw `Float64Array` (16 elements, column-major).  Callers must
 * narrow to `Float32Array` via `narrowMat4` before uploading to a GPU uniform
 * buffer.  Narrowing inside this function would discard the precision
 * advantage of the f64 path.
 *
 * Pure: no browser or WebGPU dependencies; safe to test in Node/Vitest.
 */

import { mat4d } from 'wgpu-matrix';
import type { Vec3 } from '../../@types/math/Vec3';

/**
 * Compute the f64 foreground view-projection matrix, expressed relative to
 * `renderOrigin`.
 *
 * All world-space positions passed to the vertex shader must be expressed as
 * offsets from `renderOrigin` to match the coordinate frame this matrix
 * establishes.
 *
 * @param input.eyeMpc        Camera position in world-space Mpc.
 * @param input.targetMpc     Camera look-at point in world-space Mpc.
 * @param input.up            Image-plane up direction (typically [0, 1, 0]).
 * @param input.renderOrigin  The world-space point subtracted from eye/target
 *                            before `lookAt`; keeps the view-matrix translation
 *                            small to avoid f32 precision loss at the upload
 *                            boundary.
 * @param input.fovYRad       Vertical field of view in radians.
 * @param input.aspect        Viewport width / height ratio.
 * @param input.near          Near clip plane distance in Mpc.
 * @param input.far           Far clip plane distance in Mpc.
 * @returns  A `Float64Array` of 16 values (column-major) representing the
 *           combined proj·view transform.  Narrow via `narrowMat4` before
 *           writing to a GPU uniform buffer.
 */
export function computeForegroundViewProj(input: {
  readonly eyeMpc: Readonly<Vec3>;
  readonly targetMpc: Readonly<Vec3>;
  readonly up: Readonly<Vec3>;
  readonly renderOrigin: Readonly<Vec3>;
  readonly fovYRad: number;
  readonly aspect: number;
  readonly near: number;
  readonly far: number;
}): Float64Array {
  const { eyeMpc, targetMpc, up, renderOrigin, fovYRad, aspect, near, far } =
    input;

  // Subtract renderOrigin from eye and target in f64 before lookAt.
  // This keeps the view-matrix translation small regardless of where the
  // camera sits in world space, preventing low-order bits from being lost
  // when the f64 result is eventually narrowed to f32 for GPU upload.
  const eyeRel: [number, number, number] = [
    eyeMpc[0] - renderOrigin[0],
    eyeMpc[1] - renderOrigin[1],
    eyeMpc[2] - renderOrigin[2],
  ];
  const targetRel: [number, number, number] = [
    targetMpc[0] - renderOrigin[0],
    targetMpc[1] - renderOrigin[1],
    targetMpc[2] - renderOrigin[2],
  ];

  // ── View matrix ──────────────────────────────────────────────────────────
  // mat4d defaults to Float64Array — no dtype argument needed.
  // up is a direction vector; it is NOT shifted by renderOrigin.
  const view = mat4d.lookAt(eyeRel, targetRel, up);

  // ── Projection matrix ────────────────────────────────────────────────────
  // ZO depth [0, 1] by default — matches the f32 path and WebGPU's NDC range.
  const proj = mat4d.perspective(fovYRad, aspect, near, far);

  // ── Combined view-projection ─────────────────────────────────────────────
  // mat4d.multiply(a, b) computes a * b (column-major: view applied first).
  return mat4d.multiply(proj, view) as Float64Array;
}
