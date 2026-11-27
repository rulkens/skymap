/** A density volume ready to draw; `VolumeFieldRenderer.upload` owns it from then on. */
import type { Vec3 } from '../../../packages/shared/src/@types/math/Vec3';
import type { CubePlacement } from './CubePlacement';

export type GpuVolume = {
  /** 3D; its mip 0 is the base level. */
  readonly texture: GPUTexture;
  readonly placement: CubePlacement;
  /** Multiplies the sample before the clamp to 1: log1p(levelMax[0]) / log1p(levelMax[base]). */
  readonly gain: number;
  /** The stored box in the native grid's [0,1]³: originVox / gridDims and dims / gridDims. */
  readonly nativeBox: { readonly offset: Vec3; readonly scale: Vec3 };
};
