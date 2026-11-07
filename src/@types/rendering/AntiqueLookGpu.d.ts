/**
 * AntiqueLookGpu — the antique look's pipelines, layouts and fixed buffers,
 * built on its first frame (`createAntiqueLookGpu`).
 */

export type AntiqueLookGpu = {
  readonly paper: { readonly pipeline: GPURenderPipeline; readonly layout: GPUBindGroupLayout };
  readonly reduce: { readonly pipeline: GPURenderPipeline; readonly layout: GPUBindGroupLayout };
  readonly glow: { readonly pipeline: GPURenderPipeline; readonly layout: GPUBindGroupLayout };
  readonly peaks: { readonly pipeline: GPURenderPipeline; readonly layout: GPUBindGroupLayout };
  readonly plate: { readonly pipeline: GPURenderPipeline; readonly layout: GPUBindGroupLayout };
  readonly uniforms: GPUBuffer;
  readonly ornaments: GPUBuffer;
  readonly glyphs: GPUBuffer;
  readonly clampSampler: GPUSampler;
  readonly repeatSampler: GPUSampler;
  /** All zeros: bound in place of a missing overlay, foreground:0 or asset. */
  readonly empty: GPUTextureView;
  destroy(): void;
};
