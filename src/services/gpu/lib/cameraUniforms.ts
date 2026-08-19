/**
 * cameraUniforms — the TS twin of `shaders/lib/camera.wesl`'s
 * `CameraUniforms` struct: one definition of the 80-byte camera prefix
 * every world-space renderer uploads at the head of its uniform buffer.
 *
 * ## Why a shared writer instead of per-renderer inline packing
 *
 * The WGSL side already has a single source of truth: renderers embed
 * `CameraUniforms` from `shaders/lib/camera.wesl` as the first member of
 * their `Uniforms` struct, so the GPU-visible layout is defined exactly
 * once.  The CPU side, however, used to repeat the matching three-op
 * write (`set(viewProj)`, `[16] = viewportPx.x`, `[17] = viewportPx.y`)
 * in every renderer.  A byte-layout defined in one place but written in
 * a dozen places is drift waiting to happen — and a drifted `viewportPx`
 * offset is exactly the class of bug that silently drops whole frames on
 * iOS (see CLAUDE.md's "things that have bitten us").  Mirroring the
 * single-source-of-truth pattern `utils/gpu/packGalaxyPointUniforms.ts` set for
 * the point pipeline's full struct, this module owns the prefix write so
 * the float indices live next to the byte-layout documentation.
 *
 * ## What the helper deliberately does NOT do
 *
 * - It does not allocate.  Callers pass either a fresh
 *   `new Float32Array(CAMERA_UNIFORM_BYTES / 4)` (pure-prefix renderers)
 *   or a reused per-frame scratch view over a larger struct
 *   (filaments' 96 B, the volume field's 256 B, ...).  Owning the
 *   allocation here would force the larger-struct renderers to copy.
 * - It does not `writeBuffer`.  Upload cadence, target buffer, and byte
 *   offset are per-renderer decisions (some upload the prefix alone,
 *   some upload it as the head of a bigger struct in one write).
 * - It does not touch floats 18/19 — the struct's two named pads.
 *   Pure-prefix callers rely on Float32Array zero-init; larger-struct
 *   callers that reuse scratch across frames zero the pads explicitly
 *   themselves, because a reused view has no zero-init guarantee.
 *
 * ## Byte layout (must stay byte-exact with `shaders/lib/camera.wesl`)
 *
 *   f32[ 0..15]  viewProj    mat4x4<f32>  bytes  0..63
 *   f32[16..17]  viewportPx  vec2<f32>    bytes 64..71
 *   f32[18..19]  _pad0/_pad1 two reserved f32s, bytes 72..79 — NOT
 *                written here (see above).
 *
 * The 80-byte total is what pure-prefix renderers size their uniform
 * buffer to, and what larger-struct renderers' tails start after.
 *
 * (This file exports a const AND a function — the one-symbol-per-file
 * rule is a `utils/` and `@types/` rule; the gpu-wide shared-primitives
 * `lib/` (a sibling to `renderers/` and `passes/`) groups one byte-layout's
 * constants with its writer, like `camera.wesl` groups the struct with its
 * helpers.)
 *
 * @module
 */

import type { Mat4 } from 'wgpu-matrix';
import type { Vec2 } from '../../../@types/math/Vec2';

/**
 * Byte size of the shared `CameraUniforms` prefix:
 * viewProj (64) + viewportPx (8) + two pad f32s (8) = 80.
 * Pure-prefix renderers use it as their whole uniform-buffer size;
 * larger-struct renderers' own byte tables start at this offset.
 */
export const CAMERA_UNIFORM_BYTES = 80;

/**
 * Write the CameraUniforms prefix into `target`: viewProj at floats
 * 0..15, viewportPx at 16..17.  Floats 18..19 (the named pads) are left
 * untouched — see the module header for why, and for why this neither
 * allocates nor uploads.
 *
 * `viewProj` is `Float32Array | Mat4` because renderer draw signatures
 * split along exactly that line (most take a rebased `Float32Array`;
 * filaments and the volume field take wgpu-matrix's `Mat4`) — both are
 * 16-float array-likes that `TypedArray.set` accepts directly.
 */
export function writeCameraPrefix(
  target: Float32Array,
  viewProj: Float32Array | Mat4,
  viewportPx: Vec2,
): void {
  target.set(viewProj, 0);
  target[16] = viewportPx[0];
  target[17] = viewportPx[1];
}
