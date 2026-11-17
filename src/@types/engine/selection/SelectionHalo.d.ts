import type { Vec3 } from '../../math/Vec3';

export type SelectionHalo = {
  readonly radiusMpc: number;
  readonly worldPos: Vec3;
  /** The depth slab (`NEAR0`/`COSMO`) whose frustum contains `worldPos`. */
  readonly slab: number;
};
