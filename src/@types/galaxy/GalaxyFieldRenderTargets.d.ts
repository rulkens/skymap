import type { HiiTier } from './HiiTier';

/**
 * Render targets the HOST allocates and owns. `GPUTexture` rather than
 * `GPUTextureView`: every field/HII/tier header packs `targetSizePx` off the
 * target's own pixel size, and a view exposes no dimensions.
 */
export type GalaxyFieldRenderTargets = {
  readonly fieldTex: GPUTexture;
  readonly dustMapTex: GPUTexture;
  readonly dustViewTex: GPUTexture;
  readonly hiiTex: GPUTexture;
  readonly hiiTiers: Readonly<Record<HiiTier, GPUTexture>>;
};
