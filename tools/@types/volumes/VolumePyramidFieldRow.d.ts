import type { Vec3 } from '../../../packages/shared/src/@types/math/Vec3';
import type { ScalarFieldFrameKind } from '../../../packages/shared/src/@types/data/volume/ScalarFieldFrameKind';
import type { RawDataKey } from '../../utils/io/rawDataRegistry';

/** One density field `buildVolumePyramid.ts` builds; the geometry members become its sidecar. */
export type VolumePyramidFieldRow = {
  /** The source row's `binBaseName`, read from it (MCPM_ENTRY.binBaseName), never retyped. */
  readonly id: string;
  /** `<rawDataPath(dir)>/<stem>_d{2,4,8}.npy` for the pyramid, `_d1.npy` for the bricks; C-order (x slowest). */
  readonly npy: { readonly dir: RawDataKey; readonly stem: string };
  /** levelMax[0]: the d2 file cannot know the native peak. */
  readonly nativePeak: number;
  readonly gridDims: Vec3;
  readonly voxelMpc: number;
  readonly originMpc: Vec3;
  readonly frame: ScalarFieldFrameKind;
  readonly dataBox: { readonly originVox: Vec3; readonly dims: Vec3 };
  readonly zeroBelowRaw: number;
};
