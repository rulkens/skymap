/**
 * EarthTileSubsystem — residency for Earth's surface virtual texture. A
 * third layer above the two the Earth renderer already has: base texture
 * and placeholder are untouched, so every failure path falls back to
 * today's picture rather than a hole. Owns the `BitmapStreamSubsystem` and
 * manifest; `cutSurfaceTiles` stays pure and calls back into `residentSlot`
 * to resolve what it can draw. GPU resources allocate lazily on first
 * engage; the subsystem never wakes the render loop, only votes via
 * `isAnimating()`.
 * Rationale: docs/superpowers/plans/completed/2026-07-29-earth-surface-virtual-texture-a-to-d.md
 */

import type { EarthTileId } from '../../data/EarthTileId';
import type { EarthTilePlan } from '../../scene/EarthTilePlan';
import type { EarthTilePlannerParams } from '../../scene/EarthTilePlannerParams';
import type { EarthTileDebugSnapshot } from '../../scene/EarthTileDebugSnapshot';
import type { SurfaceCutTile } from '../../scene/SurfaceCutTile';
import type { Destroyable } from '../../rendering/Destroyable';
import type { Tier } from '../../data/Tier';

export type EarthTileSubsystem = Destroyable & {
  /**
   * The pyramid facts `cutSurfaceTiles` needs, or `null` before the
   * manifest lands (first call triggers the one-shot fetch). `tier` fixes
   * `baseLevel` (three tiers, three base images z2/z3/z4).
   */
  plannerParams(tier: Tier): EarthTilePlannerParams | null;

  /**
   * Drive one frame's fetch demand; call every frame Earth's layer draws.
   * Engaged or not follows the plan (`plan.zWin > baseLevel`). Engaged:
   * LRU-touches every planned tile largest-first, enqueues anything missing
   * — allocating the atlas on first engage.
   */
  update(input: { readonly plan: EarthTilePlan }): void;

  /**
   * Resolve one exact tile's atlas residency, or `null` if it is not
   * resident. The callback `cutSurfaceTiles`'s ancestor-fallback walk calls
   * per candidate tile — keyed the same `earthTilePath(tile, prefix)` way
   * the internal `resident` map is.
   */
  residentSlot(tile: EarthTileId): {
    readonly slot: number;
    readonly atlasUvOrigin: readonly [number, number];
    readonly atlasUvScale: readonly [number, number];
  } | null;

  /**
   * Store this frame's `cutSurfaceTiles` cut for `earthLayer.draw` to read —
   * the "compute in runFrame, consume in draw" seam `plannerParams`/`update`
   * already use, one field further. Call unconditionally alongside
   * `update()`, even on a disengaged frame (an empty cut then), so a stale
   * cut can never survive a camera pull-back.
   */
  setLastCut(cut: readonly SurfaceCutTile[]): void;

  /** The cut `setLastCut` last stored — empty before the tile planner has
   *  ever run, or on a disengaged frame. */
  getLastCut(): readonly SurfaceCutTile[];

  /**
   * The tile atlas's texture view the surface-tile renderer samples, or
   * `null` before the first engaged frame. Fresh view per call, matching
   * `TextureAtlas.getTextureView()`'s own "cheap to recreate" contract — no
   * transition to track.
   */
  getAtlasView(): GPUTextureView | null;

  /**
   * Whether anything here changes next frame's picture — manifest or tile in
   * flight. A vote for the frame loop's keep-ticking predicate, never a
   * wake; read even while disengaged.
   */
  isAnimating(): boolean;

  /**
   * A fresh, cheap-to-build snapshot of atlas residency for the DebugPanel —
   * see `EarthTileDebugSnapshot`. Never call this from a render path; it
   * exists for a low-rate poll, not the frame loop.
   */
  getDebugSnapshot(): EarthTileDebugSnapshot;
};
