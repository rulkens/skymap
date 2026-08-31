import type { EarthTileRequest } from './EarthTileRequest';
import type { Vec3 } from '../math/Vec3';

/**
 * EarthTilePlan — one frame's fetch demand: which tiles the walk wants
 * resident, and the finest level it reached. This IS `cutSurfaceTiles`'s
 * `requests` product; `earthTileSubsystem.update({ plan, nowMs })` drives
 * its fetch loop off exactly this shape. Reshaped in Task 5: the page-table
 * window (`winX0`/`winY0`) this plan used to carry died with the page table
 * it sized.
 */
export type EarthTilePlan = {
  /** Finest level any leaf uses — what `update()`'s engage gate compares
   *  against `baseLevel`. */
  readonly zWin: number;
  readonly requests: readonly EarthTileRequest[];
  /** Unit direction from the body centre to the camera, in the body's LOCAL
   *  frame — what the walk itself culls against. Carried on the plan (rather
   *  than recomputed) so a debug readout can turn it into geodetic lon/lat
   *  without threading `camPosLocal` past the planner. */
  readonly subCameraDirLocal: Vec3;
};
