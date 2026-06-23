/**
 * LensingUniformBuffer — the singleton gravitational-lensing uniform a
 * pipeline binds to deflect sources behind in-view cluster lenses. Owns the
 * 272-byte GPU buffer and its bind group; `createLensingUniformBuffer` is
 * the single place that wires the buffer to its bind group, and
 * `packLensingUniforms` is the single place that knows the
 * `enabled + count + mode + scaleRadius + array<vec4, 16>` byte layout
 * (mirrored in `lib/lensingUniforms.wesl`).
 *
 * One lens set is active per frame, so the whole engine holds exactly one
 * of these (on `state.gpu.lensingUniform`) and writes it once per frame in
 * `renderFrame`. Its bind group is shared by every lensing-aware pipeline —
 * points (vertex stage) and the volume raymarch (fragment stage) — a bind
 * group is tied to a layout, not a group number, so the same object binds
 * at each pipeline's own group slot.
 */

import type { LensingUniformsValue } from './LensingUniformsValue';

export type LensingUniformBuffer = {
  /** Bind group wrapping the lensing buffer — bound at the pipeline's lensing group. */
  readonly bindGroup: GPUBindGroup;
  /** Pack `value` into the shared layout and upload it. */
  write(value: LensingUniformsValue): void;
  /** Release the underlying GPU buffer. Idempotent. */
  destroy(): void;
};
