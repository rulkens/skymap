import type { Vec3 } from '../../../../../../packages/shared/src/@types/math/Vec3';

export type RegionPlan = {
  readonly center: Vec3;
  readonly radius: number;
  readonly luminosity: number;
  readonly shellCount: number;
  readonly clusterCount: number;
};
