/**
 * TexturedDiskSubsystem — LOD-2 per-frame planner.
 *
 * Walks the catalog, applies the px ≥ 24 fetch gate, allocates atlas
 * slots through the injected `BitmapStreamSubsystem`, schedules fetches,
 * computes load-fade + distance-fade multipliers, sorts back-to-front,
 * emits the disk array. Every encoded galaxy has finite (axisRatio, PA)
 * — `tools/catalog/buildAllBins.ts` supplies a deterministic hash-based
 * fallback for sources without measured orientation — so there is no
 * screen-aligned quad branch here.
 *
 * Owns the per-key `bitmapReadyTime` map (load-fade window state) and
 * subscribes to the atlas's eviction handler to clear entries when a
 * slot is recycled.
 */

import type { Destroyable } from '../../rendering/Destroyable';
import type { DiskInstance } from '../../rendering/DiskInstance';
import type { FamousGalaxyMetaEntry } from '../../loading/FamousGalaxyMetaEntry';
import type { DiskRowVisitor } from './DiskRowVisitor';
import type { DiskWalkInput } from './DiskWalkInput';
import type { HiResFamousSubsystem } from './HiResFamousSubsystem';

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

export type TexturedDiskFrameOutput = {
  /** LOD-2 — galaxies with finite orientation, sorted back-to-front. */
  readonly disks: readonly DiskInstance[];
};

export type TexturedDiskSubsystem = Destroyable & {
  /**
   * Start a frame: returns the `DiskRowVisitor` the shared walk drives for
   * this frame.  The visitor closes over this subsystem's sticky maps, a
   * fresh per-frame disk accumulator, and the frame's `famousGalaxiesMeta` / `nowMs`
   * extras; its `endFrame` sorts back-to-front and stashes the result on
   * `lastOutput` so the pass file can read it without re-running.
   */
  beginFrame(input: TexturedDiskFrameInput): DiskRowVisitor;

  readonly lastOutput: TexturedDiskFrameOutput;

  /**
   * OR'd into the engine's render-on-demand predicate.  True while any
   * bitmap is mid-fetch OR a recently-landed bitmap is still in its
   * 400 ms load-fade window.
   */
  hasInFlightWork(): boolean;

  /**
   * Swap the hi-res LOD-3 planner read per frame. Called by
   * `engine.setTier`: the hi-res texture is sized to
   * `HI_RES_LAYER_SIDE_BY_TIER[tier]`, so a tier flip destroys + rebuilds
   * the texture + planner pair, and this subsystem must retarget its
   * closure-captured planner reference at the new instance (otherwise it
   * dereferences a torn-down planner's `lastOutput.byFamousIdx`).
   *
   * Swapping just the planner — rather than rebuilding the whole
   * texturedDiskSubsystem — keeps the per-key load-fade timestamps and
   * sticky disk maps for SDSS / 2MRS / GLADE galaxies intact; only the
   * famous hi-res state is invalidated.
   *
   * Pass `undefined` to detach. Every Famous-source disk then emits
   * `hiResLayerIdx: -1, hiResCrossfadeAlpha: 0` until a new planner is
   * installed.
   */
  setHiResFamous(hiResFamous: HiResFamousSubsystem | undefined): void;
};

/**
 * Test/inspection seam — `__testGetState` lets the planner's
 * bookkeeping be asserted from tests.
 */
export type TexturedDiskTestState = {
  readonly bitmapReadyTime: ReadonlyMap<string, number>;
};

export type TexturedDiskSubsystemWithTestSeam = TexturedDiskSubsystem & {
  __testGetState(): TexturedDiskTestState;
};
