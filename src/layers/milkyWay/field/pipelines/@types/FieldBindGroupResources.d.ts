/** The identity-bearing inputs every bind group in this module is built against. */
export type FieldBindGroupResources = {
  readonly fieldComps: GPUBuffer;
  readonly hiiComps: GPUBuffer;
  readonly dustMap: GPUTextureView;
};
