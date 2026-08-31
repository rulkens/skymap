/**
 * MilkyWayCloud — the resource handle for the app's Milky Way point cloud: the
 * GPU-generated star/dust buffers, a way to regenerate them when the star
 * count changes, and a teardown. It is the app-side analogue of one central
 * galaxy in `createGalaxyEngine.ts`, reduced to the single fixed preset the
 * Milky Way needs (`MILKY_WAY_GALAXY_PARAMS`) — no per-galaxy params surface,
 * because the only thing that ever varies is the star count.
 *
 * No `Tier` in this API. Under the multiplier this handle replaced, `Tier` fed
 * generation directly — `generate` indexed `MILKY_WAY_STARS_PER_TIER[tier]`
 * and scaled it. Now that `starCount` is absolute, generation has no use for
 * the tier at all; the tier only matters upstream, as the SOURCE of a
 * starting value (`watchTierSaga` re-seeds `settings.milkyWay.starCount` from
 * `MILKY_WAY_STARS_PER_TIER[tier]` on an explicit tier change) — a fact this
 * handle doesn't need to know to do its job.
 *
 * `buffers()` returns the CURRENT generation's buffers as a snapshot; the draw
 * side calls it each frame and never caches across a `regenerate`. `starCount()`
 * returns the count THOSE buffers were generated with — the generator is the
 * one place that fact is produced, so it is exposed here rather than tracked
 * as a shadow copy that could drift (see `reconcile` below for the consumer).
 * `regenerate` destroys the previous star/dust buffers, carves the new
 * layout, and dispatches a fresh generation. `destroy` releases everything
 * including the reused generation UBO.
 */
import type { MilkyWayCloudBuffers } from './MilkyWayCloudBuffers';

export type MilkyWayCloud = {
  readonly buffers: () => MilkyWayCloudBuffers;
  /** The starCount the CURRENT `buffers()` snapshot was generated with. */
  readonly starCount: () => number;
  /**
   * Regenerate iff the buffers on screen were generated at a different count.
   * The compare lives here because the fact does: `starCount()` is produced by
   * the generator, and a caller-side copy could only drift from the buffers it
   * describes. Self-healing by construction — it answers a slider drag and a
   * tier re-seed identically, with no second writer. Callers that fire on
   * every UI input event (e.g. a drag-driven DebugSlider) pay a full
   * destroy + allocate + dispatch per tick; that is accepted for a dev knob,
   * coalesced at the caller if it ever needs production-grade smoothness.
   */
  readonly reconcile: (wantedCount: number) => void;
  /** carve -> destroy old VBs -> create new -> pack UBO -> encode both compute passes -> submit. */
  readonly regenerate: (starCount: number) => void;
  readonly destroy: () => void;
};
