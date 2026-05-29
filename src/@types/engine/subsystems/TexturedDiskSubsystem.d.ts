/**
 * TexturedDiskSubsystem — LOD-2 per-frame planner.
 *
 * Walks the catalog, applies the px ≥ 24 fetch gate, allocates atlas
 * slots through the injected `GalaxyAtlasSubsystem`, schedules fetches,
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
import type { GalaxyCatalog } from '../../data/GalaxyCatalog';
import type { DiskInstance } from '../../rendering/DiskInstance';
import type { OrbitCamera } from '../../camera/OrbitCamera';
import type { FamousMetaEntry } from '../../loading/FamousMetaEntry';
import type { SourceType } from '../../data/SourceType';
import type { HiResFamousSubsystem } from './HiResFamousSubsystem';

export type TexturedDiskFrameInput = {
  readonly cam: OrbitCamera;
  readonly catalogs: ReadonlyMap<SourceType, GalaxyCatalog>;
  readonly visibleSourceMask: number;
  readonly pxPerRad: number;
  readonly famousMeta: readonly FamousMetaEntry[];
};

export type TexturedDiskFrameOutput = {
  /** LOD-2 — galaxies with finite orientation, sorted back-to-front. */
  readonly disks: readonly DiskInstance[];
};

export type TexturedDiskSubsystem = Destroyable & {
  runFrame(input: TexturedDiskFrameInput): TexturedDiskFrameOutput;

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
