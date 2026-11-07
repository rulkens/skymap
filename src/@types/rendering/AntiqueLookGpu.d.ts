/**
 * AntiqueLookGpu — the antique look's pipelines, layouts and fixed buffers,
 * built on its first frame (`createAntiqueLookGpu`).
 */

export type AntiqueLookGpu = {
  readonly paper: { readonly pipeline: GPURenderPipeline; readonly layout: GPUBindGroupLayout };
  readonly reduce: { readonly pipeline: GPURenderPipeline; readonly layout: GPUBindGroupLayout };
  readonly glow: { readonly pipeline: GPURenderPipeline; readonly layout: GPUBindGroupLayout };
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
  /** Instanced, one quad per placed ornament, max-blended into two rows (`decor.wesl`). */
  readonly decor: { readonly pipeline: GPURenderPipeline; readonly layout: GPUBindGroupLayout };
  readonly plate: { readonly pipeline: GPURenderPipeline; readonly layout: GPUBindGroupLayout };
  readonly uniforms: GPUBuffer;
  readonly ornaments: GPUBuffer;
  readonly digits: GPUBuffer;
  /** `PlateBodies` (`plateBodies.wesl`): the globes the plate ray-casts. */
  readonly plateBodies: GPUBuffer;
  readonly clampSampler: GPUSampler;
  readonly repeatSampler: GPUSampler;
  /** All zeros: bound in place of a missing overlay, foreground:0 or asset. */
  readonly empty: GPUTextureView;
  destroy(): void;
};
