/**
 * imagePlaneBasis — the single home for the camera's roll-adjusted up vector
 * and the orthonormal screen right/up axes it induces.
 *
 *   forward, roll, upRef  →  (this module)  →  { rolledUp, right, up }
 *
 * Two per-frame sites need this basis and used to inline it identically:
 *
 *   - `computeViewProj.ts` — its Rodrigues roll block (the `const roll =
 *     cam.roll` line onward) rotates world-up about the view direction, then
 *     hands the result to `mat4.lookAt` as the up vector. That site wants
 *     `rolledUp`.
 *   - `cameraBillboardBasis.ts` — the same roll block, followed by the two
 *     cross products that turn `rolledUp` into world-space `right`/`up` axes
 *     for expanding point-cloud billboards. That site wants `right`/`up`.
 *
 * Copying the roll math into both meant a change to one had to be mirrored in
 * the other by hand. Extracting it here makes the roll convention live in ONE
 * place, so the later orientation-frame switch reroutes a single formula.
 *
 * ### The math
 *
 * `rolledUp` rotates `upRef` about `forward` by `roll` using Rodrigues'
 * formula, in the handedness the renderer's roll has always used (the sinθ
 * term crosses `upRef × forward`, matching the inlined blocks byte-for-byte):
 *
 *     rolledUp = upRef·cosθ + (upRef × forward)·sinθ + forward·(forward·upRef)·(1−cosθ)
 *
 * For roll = 0 the formula collapses to `rolledUp = upRef` (cosθ = 1,
 * sinθ = 0, last term = 0). We early-exit that case so roll = 0 returns
 * `upRef` EXACTLY — byte-identical, which the byte-identity reroutes depend on.
 *
 * The screen axes are the same cross products `mat4.lookAt` derives internally:
 *
 *     right = normalize(forward × rolledUp)
 *     up    = normalize(right × forward)
 *
 * Each normalisation divides by `norm || 1`, so a degenerate `forward ∥ upRef`
 * (the pole-aligned case) yields a finite near-zero vector rather than NaN.
 * Callers own any fallback policy for that degeneracy.
 *
 * `forward` is taken as the rotation axis as-is — hot callers pass an
 * already-normalised view direction. Pure: no browser or WebGPU surface, so it
 * runs in plain Node/Vitest.
 *
 * @param forward  Unit view direction (target − eye, normalised) — the roll axis.
 * @param roll     Roll angle about `forward` in radians; 0 (or non-finite)
 *                 leaves `rolledUp` equal to `upRef`.
 * @param upRef    Reference up vector to roll (world +Y for the current camera).
 * @param out      Optional caller-owned scratch written in place and returned;
 *                 hot per-frame callers pass a module singleton. A fresh basis
 *                 is allocated when omitted.
 */

import type { Vec3 } from '../../@types/math/Vec3';
import type { ImagePlaneBasis } from '../../@types/camera/ImagePlaneBasis';

export function imagePlaneBasis(
  forward: Readonly<Vec3>,
  roll: number,
  upRef: Readonly<Vec3>,
  out?: ImagePlaneBasis,
): ImagePlaneBasis {
  const fx = forward[0];
  const fy = forward[1];
  const fz = forward[2];
  const ux = upRef[0];
  const uy = upRef[1];
  const uz = upRef[2];

  // ── rolledUp: upRef rotated about forward by roll (Rodrigues) ──────────
  // roll = 0 (or non-finite) returns upRef exactly via this early-exit.
  let rux = ux;
  let ruy = uy;
  let ruz = uz;
  if (Number.isFinite(roll) && roll !== 0) {
    const c = Math.cos(roll);
    const s = Math.sin(roll);
    const d = fx * ux + fy * uy + fz * uz; // forward · upRef
    // cross = upRef × forward (the handedness the renderer's roll uses)
    const cx = uy * fz - uz * fy;
    const cy = uz * fx - ux * fz;
    const cz = ux * fy - uy * fx;
    rux = ux * c + cx * s + fx * d * (1 - c);
    ruy = uy * c + cy * s + fy * d * (1 - c);
    ruz = uz * c + cz * s + fz * d * (1 - c);
  }

  // ── right = normalize(forward × rolledUp) ──────────────────────────────
  let rx = fy * ruz - fz * ruy;
  let ry = fz * rux - fx * ruz;
  let rz = fx * ruy - fy * rux;
  const rlen = Math.hypot(rx, ry, rz) || 1;
  rx /= rlen;
  ry /= rlen;
  rz /= rlen;

  // ── up = normalize(right × forward) ────────────────────────────────────
  let upx = ry * fz - rz * fy;
  let upy = rz * fx - rx * fz;
  let upz = rx * fy - ry * fx;
  const ulen = Math.hypot(upx, upy, upz) || 1;
  upx /= ulen;
  upy /= ulen;
  upz /= ulen;

  const basis =
    out ?? ({ rolledUp: [0, 0, 0], right: [0, 0, 0], up: [0, 0, 0] } as ImagePlaneBasis);
  // Mutate the vector COMPONENTS in place — the fields are readonly Vec3
  // references, not reassignable, but their elements are the scratch we own.
  basis.rolledUp[0] = rux;
  basis.rolledUp[1] = ruy;
  basis.rolledUp[2] = ruz;
  basis.right[0] = rx;
  basis.right[1] = ry;
  basis.right[2] = rz;
  basis.up[0] = upx;
  basis.up[1] = upy;
  basis.up[2] = upz;
  return basis;
}
