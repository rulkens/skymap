/**
 * TexturedImpostorSubsystem — LOD-2 per-frame planner.
 *
 * Walks the catalog, applies the px ≥ 24 fetch gate, allocates atlas
 * slots through the injected `GalaxyAtlasSubsystem`, schedules fetches,
 * computes load-fade + distance-fade multipliers, sorts back-to-front,
 * emits the disk array.
 *
 * The legacy screen-aligned quad fallback (for galaxies with missing
 * orientation) was removed on 2026-05-18 — `tools/catalog/buildAllBins.ts`
 * applies a deterministic hash-based orientation fallback so every
 * encoded galaxy has finite (axisRatio, PA), meaning the quad branch
 * never fired for non-Famous galaxies and only fired for famous ones at
 * <4 px apparent size (where the point sprite handled them already).
 *
 * Owns the per-key `bitmapReadyTime` map (the load-fade window state).
 * Subscribes to the atlas's eviction handler to clear that map when
 * a slot is recycled.
 */

import type { Destroyable } from '../../rendering/Destroyable';
import type { GalaxyCatalog } from '../../data/GalaxyCatalog';
import type { DiskInstance } from '../../rendering/DiskInstance';
import type { OrbitCamera } from '../../camera/OrbitCamera';
import type { FamousMetaEntry } from '../../loading/FamousMetaEntry';
import type { Source } from '../../../data/sources';

export type TexturedImpostorFrameInput = {
  readonly cam: OrbitCamera;
  readonly catalogs: ReadonlyMap<Source, GalaxyCatalog>;
  readonly visibleSourceMask: number;
  readonly pxPerRad: number;
  readonly famousMeta: readonly FamousMetaEntry[];
};

export type TexturedImpostorFrameOutput = {
  /** LOD-2 — galaxies with finite orientation, sorted back-to-front. */
  readonly disks: readonly DiskInstance[];
};

export type TexturedImpostorSubsystem = Destroyable & {
  runFrame(input: TexturedImpostorFrameInput): TexturedImpostorFrameOutput;

  readonly lastOutput: TexturedImpostorFrameOutput;

  /**
   * OR'd into the engine's render-on-demand predicate.  True while any
   * bitmap is mid-fetch OR a recently-landed bitmap is still in its
   * 400 ms load-fade window.
   */
  hasInFlightWork(): boolean;
};

/**
 * Test/inspection seam — the LOD-2 planner exposes the same `__testGetState`
 * shape the legacy thumbnailSubsystem did, so the split-out tests can
 * inspect the post-extraction subsystem's bookkeeping the same way.
 */
export type TexturedImpostorTestState = {
  readonly bitmapReadyTime: ReadonlyMap<string, number>;
};

export type TexturedImpostorSubsystemWithTestSeam = TexturedImpostorSubsystem & {
  __testGetState(): TexturedImpostorTestState;
};
