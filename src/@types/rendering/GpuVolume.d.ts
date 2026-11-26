/**
 * GpuVolume — a density volume ready to draw: a finished 3D texture and where it sits. A load step
 * per storage format makes one; `VolumeFieldRenderer.upload` takes it and owns it from then on.
 */
import type { CubePlacement } from './CubePlacement';

export type GpuVolume = {
  /** 3D; its mip 0 is the base level. Owned by the renderer once `upload` runs. */
  readonly texture: GPUTexture;
  /** The stored box at base resolution, in world terms (`buildCubeModelMatrix`'s input). */
  readonly placement: CubePlacement;
};
