/** The GPU resources the apply borrows from each `atmosphereShellRenderer` bundle. */
export type AerialBundleResources = {
  readonly scatteringBuffer: GPUBuffer;
  readonly skyViewParamsBuffer: GPUBuffer;
  readonly shellUniformBuffer: GPUBuffer;
  readonly transmittanceTex: GPUTexture;
  readonly multiScatterTex: GPUTexture;
  readonly skyViewTex: GPUTexture;
};
