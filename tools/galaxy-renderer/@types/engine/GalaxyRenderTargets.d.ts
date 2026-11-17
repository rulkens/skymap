import type { GalaxyFieldRenderTargets } from '../../../../src/layers/milkyWay/field/@types/GalaxyFieldRenderTargets';
import type { Vec2 } from '../../../../src/@types/math/Vec2';
import type { TargetDivisors } from './TargetDivisors';

/**
 * Textures are getters, never snapshot properties: every one of them is
 * replaced by a resize or a divisor drag, and a caller holding the object
 * across frames must still see the live texture.
 */
export type GalaxyRenderTargets = {
  readonly sceneTex: GPUTexture;
  readonly ldrTex: GPUTexture;
  readonly aggregateTex: GPUTexture;
  /** The field module's targets, `dustView` included. Rebuilt per read; each view is stable until its reallocation. */
  readonly fieldTargets: Required<GalaxyFieldRenderTargets>;
  /** The textures behind `fieldTargets.field` and `.dustMap`, for the probe's `readTextureChannelSum`. */
  readonly fieldTex: GPUTexture;
  readonly dustMapTex: GPUTexture;
  readonly bloomMips: readonly GPUTexture[];
  /** Pixel size of a target at `divisor` — also what the passes pack as `viewportPx`. */
  reducedSize(divisor: number): Vec2;
  bloomTexelSize(level: number): Vec2;
  /** Recreate the canvas-sized targets, then bring the reduced ones up to date. */
  rebuildAll(divisors: TargetDivisors): void;
  /**
   * Reallocate whichever reduced targets these divisors no longer describe.
   * Safe to call on every render-bag push: the comparison is against the live
   * textures' pixel sizes, so an unmoved divisor is a no-op.
   */
  setDivisors(divisors: TargetDivisors): void;
  destroy(): void;
};
