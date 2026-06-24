/**
 * NfwLensLutTexture — the GPU handle for the precomputed inverse-NFW-lens
 * lookup table, uploaded once at startup and sampled in the vertex stage.
 *
 * The texture is `rgba16float` (N = lut.width columns along the y-axis,
 * M = lut.height rows along the s-axis), sampled with a clamp-to-edge
 * linear sampler. Created by `createNfwLensLutTexture`.
 */

export type NfwLensLutTexture = {
  /** The N×M rgba16float LUT texture (N = lut.width, M = lut.height). */
  readonly texture: GPUTexture;
  /** Its default view — bound at @group(3) @binding(2). */
  readonly view: GPUTextureView;
  /** Clamp-to-edge, linear-filtering sampler — bound at @group(3) @binding(3). */
  readonly sampler: GPUSampler;
  /** Release the texture. Idempotent. */
  destroy(): void;
};
