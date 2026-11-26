import type { Vec3 } from '../../../../packages/shared/src/@types/math/Vec3';
import type { SimLaneCounts } from '../sim/SimLaneCounts';

/**
 * AutoFitRequest — what Auto fit needs: the bounds to fit (padding not yet added)
 * and the lanes, since the voxel size it leaves must keep the whole sim in memory.
 */
export type AutoFitRequest = {
  readonly bounds: { readonly min: Vec3; readonly max: Vec3 };
  readonly lanes: SimLaneCounts;
};
