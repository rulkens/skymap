import type { TileStreamSubsystem } from './tileStreamSubsystem/TileStreamSubsystem';
import type { HiResFamousSubsystem } from './hiResFamousSubsystem/HiResFamousSubsystem';

/** Construction options for `createTexturedDiskSubsystem`. */
export type TexturedDiskDeps = {
  readonly device: GPUDevice;
  readonly atlas: TileStreamSubsystem<ImageBitmap>;
  /** For tests. Defaults to fetchGalaxyBitmap. */
  readonly fetcher?: (args: {
    ra: number;
    dec: number;
    famousId?: string;
  }) => Promise<ImageBitmap | null>;
  /**
   * Optional LOD-3 source. When provided, the planner folds each famous
   * galaxy's `hiResLayerIdx` + `hiResCrossfadeAlpha` into its `DiskInstance`;
   * when omitted, every instance gets the -1 / 0 sentinel and the shader's
   * `hiResLayerIdx >= 0` gate skips the hi-res sample.
   */
  readonly hiResFamous?: HiResFamousSubsystem;
};
