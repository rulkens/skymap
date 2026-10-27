import type { SurfaceTileRequest } from './SurfaceTileRequest';
import type { Vec3 } from '../math/Vec3';

/**
 * SurfaceTileDemand — one frame's fetch demand: which tiles the walk wants
 * resident, and the finest level it reached. This IS `cutSurfaceTiles`'s
 * `requests` product, which `planSurfaceTiles` splits into the touches and
 * misses `SurfaceTilePlan` hands the stream.
 */
export type SurfaceTileDemand = {
  /** Finest level any leaf uses — what `update()`'s engage gate compares
   *  against `baseLevel`. */
  readonly zWin: number;
  readonly requests: readonly SurfaceTileRequest[];
  /** Unit direction from the body centre to the camera, in the body's LOCAL
   *  frame — what the walk itself culls against. Carried on the plan (rather
   *  than recomputed) so a debug readout can turn it into geodetic lon/lat
   *  without threading `camPosLocal` past the planner. */
  readonly subCameraDirLocal: Vec3;
};
