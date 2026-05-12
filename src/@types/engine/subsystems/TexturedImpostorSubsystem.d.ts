/**
 * TexturedImpostorSubsystem — LOD-2 per-frame planner.
 *
 * Walks the catalog, applies the px ≥ 24 fetch gate, allocates atlas
 * slots through the injected `GalaxyAtlasSubsystem`, schedules fetches,
 * applies the metadata-based disk-vs-quad branch (per-galaxy choice
 * driven by `Number.isFinite(axisRatio) && Number.isFinite(positionAngleDeg)`
 * — see the legacy thumbnailSubsystem.ts:820), computes load-fade +
 * distance-fade multipliers, sorts back-to-front, emits two arrays.
 *
 * Owns the per-key `bitmapReadyTime` map (the load-fade window state).
 * Subscribes to the atlas's eviction handler to clear that map when
 * a slot is recycled.
 */

import type { Destroyable } from '../../rendering/Destroyable';
import type { PointCloud } from '../../data/PointCloud';
import type { ThumbnailInstance } from '../../rendering/ThumbnailInstance';
import type { DiskInstance } from '../../rendering/DiskInstance';
import type { OrbitCamera } from '../../camera/OrbitCamera';
import type { FamousMetaEntry } from '../../loading/FamousMetaEntry';
import type { Source } from '../../../data/sources';

export type TexturedImpostorFrameInput = {
  readonly cam: OrbitCamera;
  readonly clouds: ReadonlyMap<Source, PointCloud>;
  readonly visibleSourceMask: number;
  readonly pxPerRad: number;
  readonly famousMeta: readonly FamousMetaEntry[];
};

export type TexturedImpostorFrameOutput = {
  /** LOD-2 primary pipeline — galaxies with finite orientation. */
  readonly disks: readonly DiskInstance[];
  /** LOD-2 fallback pipeline — galaxies missing orientation. */
  readonly quads: readonly ThumbnailInstance[];
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
