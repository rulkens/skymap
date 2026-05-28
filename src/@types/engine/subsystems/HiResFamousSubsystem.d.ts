/**
 * HiResFamousSubsystem — LOD-3 per-frame planner for Famous-source galaxies.
 *
 * Sits one rung above the LOD-2 textured disk: when a famous galaxy
 * grows past ~200 px of apparent diameter, the 128 px atlas tile starts
 * to look soft and pixel-doubled.  This subsystem gates each Famous-
 * source galaxy on `apparentSizePx ≥ 200`, allocates one of N=8
 * `texture_2d_array` layers (LRU-evicting the least-recently-large
 * layer when full), enqueues a `dataUrl('images/famous-hires/<id>.webp')`
 * fetch through the shared image queue, and emits per-galaxy state
 * (`hiResLayerIdx`, `hiResCrossfadeAlpha`) for `texturedDiskSubsystem`
 * to fold into the instance buffer it ships to the textured-disk
 * renderer.
 *
 * No GPU draw work happens here — the actual sampling + crossfade is
 * the textured-disk fragment shader's job.  This subsystem only owns
 * the planner state (which layer holds which galaxy, when each layer
 * was last "large", and the smoothstep alpha for the 200 → 260 px
 * crossfade band).  Output keyed by Famous-source local index so the
 * consumer can look up state without re-walking the catalog; missing
 * keys default to `{ hiResLayerIdx: -1, hiResCrossfadeAlpha: 0 }` at
 * the consumer (i.e. atlas-tile-only rendering, unchanged).
 *
 * See `docs/superpowers/specs/2026-05-28-famous-galaxy-high-res-lod-design.md`
 * for the full data flow + edge cases (LRU mid-crossfade, in-out fly-by,
 * missing `full.webp`, tier change rebuilds, …).
 */

import type { Destroyable } from '../../rendering/Destroyable';
import type { GalaxyCatalog } from '../../data/GalaxyCatalog';
import type { OrbitCamera } from '../../camera/OrbitCamera';
import type { FamousMetaEntry } from '../../loading/FamousMetaEntry';
import type { SourceType } from '../../data/SourceType';

export type HiResFamousFrameInput = {
  readonly cam: OrbitCamera;
  readonly catalogs: ReadonlyMap<SourceType, GalaxyCatalog>;
  readonly visibleSourceMask: number;
  readonly pxPerRad: number;
  readonly famousMeta: readonly FamousMetaEntry[];
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
   * Pure CPU step.  See the module docstring for what it does.
   * Returns the output AND stashes it on `lastOutput` so consumers
   * (texturedDiskSubsystem) can read it without re-running.
   */
  runFrame(input: HiResFamousFrameInput): HiResFamousFrameOutput;

  /**
   * Latest output — read by `texturedDiskSubsystem.runFrame` to fold
   * per-galaxy `hiResLayerIdx` + `hiResCrossfadeAlpha` into the disk
   * instance buffer.  Initialised to an empty map so the consumer
   * reads valid (empty) data before the first frame.
   */
  readonly lastOutput: HiResFamousFrameOutput;
};
