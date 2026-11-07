/**
 * AntiqueLookGpu — the antique look's pipelines, layouts and fixed buffers,
 * built on its first frame (`createAntiqueLookGpu`).
 */

export type AntiqueLookGpu = {
  readonly paper: { readonly pipeline: GPURenderPipeline; readonly layout: GPUBindGroupLayout };
  readonly reduce: { readonly pipeline: GPURenderPipeline; readonly layout: GPUBindGroupLayout };
  readonly glow: { readonly pipeline: GPURenderPipeline; readonly layout: GPUBindGroupLayout };
  /** The galaxy engraving's quarter-res fields (`nebula.wesl`). */
  readonly nebula: { readonly pipeline: GPURenderPipeline; readonly layout: GPUBindGroupLayout };
  /** The structure markers' row box-meaned to 1/16 (`structureGlow.wesl`). */
  readonly structureGlow: {
    readonly pipeline: GPURenderPipeline;
    readonly layout: GPUBindGroupLayout;
  };
  /** One workgroup: the glow's 30th-percentile luma into `skyFloorBuffer` (`skyFloor.wesl`). */
  readonly skyFloor: { readonly pipeline: GPUComputePipeline; readonly layout: GPUBindGroupLayout };
  /** The land share's separable blur (`landBlur.wesl`), across then down. */
  readonly landBlurAcross: {
    readonly pipeline: GPURenderPipeline;
    readonly layout: GPUBindGroupLayout;
  };
  readonly landBlurDown: {
    readonly pipeline: GPURenderPipeline;
    readonly layout: GPUBindGroupLayout;
  };
  /** Instanced, one quad per print-points texel, max-blended (`glyphs.wesl`). */
  readonly glyphs: { readonly pipeline: GPURenderPipeline; readonly layout: GPUBindGroupLayout };
  /** The cosmic web charted into the glyphs' row, in their pass (`web.wesl`). */
  readonly web: { readonly pipeline: GPURenderPipeline; readonly layout: GPUBindGroupLayout };
  /** Instanced, one quad per placed ornament, max-blended into two rows (`decor.wesl`). */
  readonly decor: { readonly pipeline: GPURenderPipeline; readonly layout: GPUBindGroupLayout };
  readonly plate: { readonly pipeline: GPURenderPipeline; readonly layout: GPUBindGroupLayout };
  readonly uniforms: GPUBuffer;
  readonly ornaments: GPUBuffer;
  readonly digits: GPUBuffer;
  /** `PlateBodies` (`plateBodies.wesl`): the globes the plate ray-casts. */
  readonly plateBodies: GPUBuffer;
  /** Written by the sky-floor compute, read by the plate in the same submit. */
  readonly skyFloorBuffer: GPUBuffer;
  readonly clampSampler: GPUSampler;
  readonly repeatSampler: GPUSampler;
  /** All zeros: bound in place of a missing overlay, foreground:0 or asset. */
  readonly empty: GPUTextureView;
  destroy(): void;
};
