import type { ViewSlotUniformRing } from '../../../@types/rendering/ViewSlotUniformRing';

/** One catalog's GPU vertex buffer and the per-source bind groups it needs. */
export type LoadedSource = {
  buffer: GPUBuffer;
  count: number;
  /** CPU mirror of `buffer`'s bytes — lets the bias-correction subsystem splice slots 10/11 and re-upload in one `writeBuffer` call. */
  interleaved: Float32Array;
  /** Per-view-slot FadeUniforms (Task 13b): a cubemap capture sweep draws this catalog once per face before one `submit()`, so a shared buffer would keep only the last opacity. */
  fade: ViewSlotUniformRing;
  /** Per-source SourceUniforms (6-bit sourceCode + pad), written once at upload. */
  sourceBuffer: GPUBuffer;
  sourceBindGroup: GPUBindGroup;
};
