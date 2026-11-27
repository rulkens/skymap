import type { Vec3 } from '../../../../packages/shared/src/@types/math/Vec3';

export type VolumePyramidLevel = {
  readonly level: 1 | 2 | 3;
  /** level − baseLevel: the texture mip this level fills. */
  readonly mip: number;
  /** dataBox.dims >> level. */
  readonly dims: Vec3;
  /** levelByteLength(dims, TEXTURE_BYTES_PER_TEXEL[gpuFormat]): the file's exact length. */
  readonly byteLength: number;
};
