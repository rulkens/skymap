/** What `createVolumeFieldRenderer` is built from. */
import type { FadeUniformsBgl } from './FadeUniformsBgl';

export type VolumeFieldRendererDeps = {
  readonly device: GPUDevice;
  /** The colour format the march writes into: the HDR offscreen, never the swap format. */
  readonly targetFormat: GPUTextureFormat;
  readonly fadeBgl: FadeUniformsBgl;
  /** r8unorm, BLUE_NOISE_MASK_SIZE wide, slices stacked vertically (`blueNoiseMask`'s layout).
   *  Not owned: the caller destroys it. */
  readonly jitterMask: GPUTexture;
};
