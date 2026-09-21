import type { FamousGalaxyMetaEntry } from '../../../loading/FamousGalaxyMetaEntry';
import type { DiskWalkInput } from '../DiskWalkInput';

/**
 * The textured body IS the one with extras beyond the geometry-bearing walk
 * input: the per-row famous calibration lookup (`famousGalaxiesMeta`) and the stamped
 * frame clock (`nowMs`). Everything the shared walk actually reads lives in
 * `DiskWalkInput`; this type intersects those extras onto it so the walk never
 * sees fields it doesn't use.
 */
export type TexturedDiskFrameInput = DiskWalkInput & {
  readonly famousGalaxiesMeta: readonly FamousGalaxyMetaEntry[];
  /**
   * The frame's stamped clock (`ctx.nowMs`). Drives the load-fade ramp and
   * the arrival timestamps, so crossfade alphas are a pure function of
   * stamped time — deterministic under a stepped recorder clock — instead
   * of sampling `performance.now()` inside the planner.
   */
  readonly nowMs: number;
};
