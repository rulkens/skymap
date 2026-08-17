/**
 * HiResFamousSubsystem — LOD-3 per-frame planner for Famous-source galaxies.
 *
 * One rung above the LOD-2 textured disk: when a famous galaxy grows
 * past ~200 px of apparent diameter, the 128 px atlas tile starts to
 * look soft. This subsystem gates each Famous galaxy on
 * `apparentSizePx ≥ 200`, allocates one of N=8 `texture_2d_array` layers
 * (LRU-evicting the least-recently-large layer when full), enqueues a
 * `dataUrl('images/famous-hires/<id>.webp')` fetch through the shared
 * image queue, and emits per-galaxy `(hiResLayerIdx, hiResCrossfadeAlpha)`
 * for `texturedDiskSubsystem` to fold into the instance buffer.
 *
 * No GPU draw work happens here — sampling + crossfade is the
 * textured-disk fragment shader's job. The planner owns only the
 * bookkeeping (layer ↔ galaxy assignment, recent-large signal per layer,
 * smoothstep alpha across the 200 → 260 px crossfade band). Output is
 * keyed by Famous-source local index; missing keys default to
 * `{ hiResLayerIdx: -1, hiResCrossfadeAlpha: 0 }` (atlas-tile-only).
 *
 * See `docs/superpowers/specs/completed/2026-05-28-famous-galaxy-high-res-lod-design.md`
 * for data flow + edge cases (LRU mid-crossfade, in-out fly-by, missing
 * `full.webp`, tier-change rebuilds).
 */

import type { Destroyable } from '../../rendering/Destroyable';
import type { GalaxyCatalog } from '../../data/GalaxyCatalog';
import type { OrbitCamera } from '../../camera/OrbitCamera';
import type { FamousGalaxyMetaEntry } from '../../loading/FamousGalaxyMetaEntry';
import type { SourceType } from '../../data/SourceType';

export type HiResFamousFrameInput = {
  readonly cam: OrbitCamera;
  readonly catalogs: ReadonlyMap<SourceType, GalaxyCatalog>;
  readonly visibleSourceMask: number;
  readonly pxPerRad: number;
  readonly famousGalaxiesMeta: readonly FamousGalaxyMetaEntry[];
};

export type HiResFamousPerGalaxyState = {
  /** Layer index in the hi-res `texture_2d_array`, or -1 if no slot is allocated. */
  readonly hiResLayerIdx: number;
  /** Smoothstep alpha in [0, 1] across the 200 → 260 px crossfade band. */
  readonly hiResCrossfadeAlpha: number;
};

export type HiResFamousFrameOutput = {
  /**
   * Per-Famous-source local index → state.  Missing keys default to
   * `{ hiResLayerIdx: -1, hiResCrossfadeAlpha: 0 }` at the consumer
   * (so galaxies under the gate, mid-fetch, or without a curated
   * `full.webp` simply fall through to atlas-tile-only rendering).
   */
  readonly byFamousIdx: ReadonlyMap<number, HiResFamousPerGalaxyState>;
};

export type HiResFamousSubsystem = Destroyable & {
  /**
   * Pure CPU step. Returns the output and stashes it on `lastOutput` so
   * `texturedDiskSubsystem` can read it without re-running.
   */
  runFrame(input: HiResFamousFrameInput): HiResFamousFrameOutput;

  /**
   * Latest output — read by `texturedDiskSubsystem.runFrame` to fold
   * `hiResLayerIdx` + `hiResCrossfadeAlpha` into the disk instance
   * buffer. Initialised to an empty map so the consumer reads valid
   * (empty) data before the first frame.
   */
  readonly lastOutput: HiResFamousFrameOutput;
};
