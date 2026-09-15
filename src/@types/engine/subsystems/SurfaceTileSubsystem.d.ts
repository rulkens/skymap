/**
 * SurfaceTileSubsystem — residency for one body's surface virtual texture at
 * a time (§ registry-driven, one engaged — `SURFACE_TILE_REGISTRY`). A third
 * layer above the two the body's own renderer already has: base texture and
 * placeholder are untouched, so every failure path falls back to today's
 * picture rather than a hole. Owns the `TileStreamSubsystem<ImageBitmap>` and manifest;
 * `cutSurfaceTiles` stays pure and calls back into `residentSlot` to resolve
 * what it can draw. GPU resources allocate lazily on first engage; the
 * subsystem never wakes the render loop, only votes via `isAnimating()`.
 * Rationale: docs/superpowers/plans/completed/2026-07-29-earth-surface-virtual-texture-a-to-d.md
 */

import type { SurfaceTileId } from '../../data/SurfaceTileId';
import type { SurfaceTilePlan } from '../../scene/SurfaceTilePlan';
import type { SurfaceTilePlannerParams } from '../../scene/SurfaceTilePlannerParams';
import type { SurfaceTileDebugSnapshot } from '../../scene/SurfaceTileDebugSnapshot';
import type { SurfaceCutTile } from '../../scene/SurfaceCutTile';
import type { Destroyable } from '../../rendering/Destroyable';
import type { BodyId } from '../../data/body/BodyId';

export type SurfaceTileSubsystem = Destroyable & {
  /**
   * The pyramid facts `cutSurfaceTiles` needs for `bodyId`, or `null` before
   * its manifest lands (a call for a body not seen before, or seen last as a
   * different body, triggers a one-shot fetch keyed by
   * `SURFACE_TILE_REGISTRY[bodyId].manifestKey`). `baseLevel` is the
   * caller's — this subsystem no longer derives it from a `Tier`, since which
   * function does that is body-specific (`earthBaseLevelForTier` today).
   */
  plannerParams(bodyId: BodyId, baseLevel: number): SurfaceTilePlannerParams | null;

  /**
   * Drive one frame's fetch demand; call every frame the body's layer draws.
   * A `bodyId` other than the currently ENGAGED one stands the old body's
   * atlas and residency down first (§ one engaged) and starts fresh for the
   * new one. Engaged or not follows the plan (`plan.zWin > baseLevel`).
   * Engaged: LRU-touches every planned tile largest-first, enqueues anything
   * missing — allocating the atlas on first engage.
   */
  update(input: { readonly bodyId: BodyId; readonly plan: SurfaceTilePlan }): void;

  /**
   * Resolve one exact tile's atlas residency, or `null` if it is not
   * resident. The callback `cutSurfaceTiles`'s ancestor-fallback walk calls
   * per candidate tile — keyed the same `surfaceTilePath(tile, prefix)` way
   * the internal `resident` map is.
   */
  residentSlot(tile: SurfaceTileId): {
    readonly slot: number;
    readonly atlasUvOrigin: readonly [number, number];
    readonly atlasUvScale: readonly [number, number];
    /** `performance.now()` (REAL time) stamped when this slot's bitmap
     *  uploaded — see `SurfaceCutTile.albedo.readyAtMs`. */
    readonly readyAtMs: number;
    /** HEIGHT only: the `shgt1` header's `subtreeMin/MaxM` (metres), which
     *  bound every descendant of this tile — the walk's frustum-cull
     *  headroom for displaced geometry. Null for albedo. */
    readonly subtreeRangeM: readonly [number, number] | null;
  } | null;

  /**
   * Store this frame's `cutSurfaceTiles` cut for `earthPass.draw` to read —
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

  /** The HEIGHT atlas's texture view (`r32float`, 129-post slots), or `null`
   *  before the first engaged frame. Unread until F2 displaces geometry —
   *  F1 only has to make the tiles resident. */
  getHeightAtlasView(): GPUTextureView | null;

  /**
   * Whether anything here changes next frame's picture — manifest or tile in
   * flight. A vote for the frame loop's keep-ticking predicate, never a
   * wake; read even while disengaged.
   */
  isAnimating(): boolean;

  /**
   * A fresh, cheap-to-build snapshot of atlas residency for the DebugPanel —
   * see `SurfaceTileDebugSnapshot`. Never call this from a render path; it
   * exists for a low-rate poll, not the frame loop.
   */
  getDebugSnapshot(): SurfaceTileDebugSnapshot;
};
