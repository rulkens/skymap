/** `antiqueMapRenderer`'s GPU objects, built on the first draw after the map lands. */
export type AntiqueMapGpu = {
  readonly fill: GPURenderPipeline;
  readonly line: GPURenderPipeline;
  readonly sign: GPURenderPipeline;
  readonly uniforms: GPUBuffer;
  readonly fillBind: GPUBindGroup;
  readonly lineBind: GPUBindGroup;
  readonly signBind: GPUBindGroup;
  readonly buffers: GPUBuffer[];
  readonly fillVertices: GPUBuffer;
  readonly fillIndices: GPUBuffer;
  readonly fillIndexCount: number;
  readonly lines: GPUBuffer;
  readonly lineLevelEnds: readonly number[];
  readonly signs: GPUBuffer;
  readonly signCount: number;
  readonly towns: GPUBuffer;
  readonly townCount: number;
};
