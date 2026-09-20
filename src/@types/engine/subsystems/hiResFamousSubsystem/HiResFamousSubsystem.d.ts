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

import type { Destroyable } from '../../../rendering/Destroyable';
import type { HiResFamousFrameInput } from './HiResFamousFrameInput';
import type { HiResFamousFrameOutput } from './HiResFamousFrameOutput';

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
