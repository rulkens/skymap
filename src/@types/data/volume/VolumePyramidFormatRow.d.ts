import type { VolumePyramidFormat } from './VolumePyramidFormat';

export type VolumePyramidFormatRow = {
  readonly format: VolumePyramidFormat;
  readonly gpuFormat: GPUTextureFormat;
  /** Texels per block side in x and y; blocks are 2D, one z-slice deep. */
  readonly blockEdge: 1 | 4 | 6;
  /** All required before a 3D texture of this format may be created. */
  readonly features: readonly GPUFeatureName[];
  /** One block that decodes to 0. An all-zero ASTC block is an error block, not zero. */
  readonly zeroBlock: Uint8Array;
};
