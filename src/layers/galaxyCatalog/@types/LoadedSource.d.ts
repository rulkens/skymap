import type { ViewSlotUniformRing } from '../../../@types/rendering/ViewSlotUniformRing';

/** One catalog's GPU vertex buffer and the per-source bind groups it needs. */
export type LoadedSource = {
  buffer: GPUBuffer;
  count: number;
  /** Per-view-slot FadeUniforms (Task 13b): a cubemap capture sweep draws this catalog once per face before one `submit()`, so a shared buffer would keep only the last opacity. */
  fade: ViewSlotUniformRing;
  /** Per-source SourceUniforms (6-bit sourceCode + pad), written once at upload. */
  sourceBuffer: GPUBuffer;
  sourceBindGroup: GPUBindGroup;
};
