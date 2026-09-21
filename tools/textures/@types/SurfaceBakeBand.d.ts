import type { HeightSource } from './HeightSource';
import type { SurfaceImagerySource } from './SurfaceImagerySource';

/** One imagery band `bakeAll` bakes: a source plus the depth floor it starts
 *  from, and the (optional) height source riding the same boxes and levels
 *  (§4.1) — see `bakeAll`'s own docstring for the underfill/water rules. */
export type SurfaceBakeBand = {
  readonly source: SurfaceImagerySource;
  readonly minLevel: number;
  readonly underfill?: SurfaceImagerySource;
  readonly height?: HeightSource;
  readonly heightUnderfill?: HeightSource;
  readonly flattenWater?: boolean;
};
