import type { SurfaceTileRequest } from './SurfaceTileRequest';

/**
 * SurfaceTileDemand — one frame's fetch demand: which tiles the walk wants
 * resident, and the finest level it reached. This IS `cutSurfaceTiles`'s
 * `requests` product, which `planSurfaceTiles` splits into the touches and
 * misses `SurfaceTilePlan` hands the stream.
 */
export type SurfaceTileDemand = {
  /** Finest level any leaf uses — what the planner's engage gate compares
   *  against `baseLevel`. */
  readonly zWin: number;
  readonly requests: readonly SurfaceTileRequest[];
};
