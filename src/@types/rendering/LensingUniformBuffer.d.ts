/**
 * LensingUniformBuffer — the singleton gravitational-lensing uniform a
 * pipeline binds to deflect sources behind in-view cluster lenses. Owns the
 * 528-byte GPU buffer and its bind group; 'createLensingUniformBuffer' is
 * the single place that wires the buffer to its bind group, and
 * 'packLensingUniforms' is the single place that knows the
 * 'enabled + count + mode + _pad0 + array<LensData, 16>' byte layout — each
 * LensData is two vec4s: geom (dirLens xyz, dL w) + params (thetaERad x, r_s y)
 * (mirrored in 'lib/lensingUniforms.wesl').
 *
 * One lens set is active per frame, so the whole engine holds exactly one
 * of these (on `state.gpu.lensingUniform`) and writes it once per frame in
 * `renderFrame`. The single `buffer` is the shared unit: the points + pick
 * pipelines embed it as a second binding in their own `@group(0)` (WebGPU
 * caps a pipeline at 4 bind groups, and points already uses all four — so
 * lensing rides binding 1 of the per-pipeline uniforms group rather than a
 * 5th group). The standalone `bindGroup` lets a pipeline with a free group
 * (the volume raymarch) bind the same buffer directly.
 */

import type { LensingUniformsValue } from './LensingUniformsValue';

export type LensingUniformBuffer = {
  /** The lensing GPU buffer itself — embedded as `@group(0) @binding(1)` by the points + pick pipelines. */
  readonly buffer: GPUBuffer;
  /** Standalone bind group wrapping the buffer — for a pipeline binding it at its own free group (volume raymarch). */
  readonly bindGroup: GPUBindGroup;
  /** Pack `value` into the shared layout and upload it. */
  write(value: LensingUniformsValue): void;
  /** Release the underlying GPU buffer. Idempotent. */
  destroy(): void;
};
