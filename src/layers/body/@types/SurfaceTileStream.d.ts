/**
 * SurfaceTileStream — the sole owner of surface-tile residency, one body's
 * atlases at a time (`SURFACE_TILE_REGISTRY`): manifests, both atlases, LRU,
 * key → slot, in-flight and failed keys. It decides nothing; it applies
 * `planSurfaceTiles`' plan, as `OctreeChunkStream` does `planOctreeChunks`'.
 * GPU memory allocates on the first `engage` verdict, so a session that never
 * approaches a tiling body pays nothing.
 * Rationale: docs/superpowers/plans/completed/2026-07-29-earth-surface-virtual-texture-a-to-d.md
 */

import type { SurfaceTilePlan } from './SurfaceTilePlan';
import type { SurfaceTileResidency } from './SurfaceTileResidency';
import type { SurfaceTileDebugSnapshot } from './SurfaceTileDebugSnapshot';
import type { Destroyable } from '../../../@types/rendering/Destroyable';
import type { SceneBodyId } from '../../../@types/scene/SceneBodyId';
import type { Vec3 } from '../../../@types/math/Vec3';
import type { SurfaceTilePlannerParams } from './SurfaceTilePlannerParams';

export type SurfaceTileStream = Destroyable & {
  readonly residency: SurfaceTileResidency;

  /** The manifest request, then the verdict, then touches before allocations,
   *  so no miss evicts a tile this same plan wants. */
  apply(plan: SurfaceTilePlan): void;

  /**
   * Terrain height (metres above the datum) under a body-fixed direction —
   * the CPU twin of the shader's `lattice.wesl` sampler (spec §8.4). `0` for
   * any body but the engaged one: another body's tiles answer nothing here.
   * `params` are the last plan's (`SurfaceTilePlan.params`): the climb stops
   * at the base level the cut was walked from.
   */
  heightAt(
    bodyId: SceneBodyId,
    dirBodyFixed: Readonly<Vec3>,
    params: SurfaceTilePlannerParams | null,
  ): number;

  /**
   * The level `heightAt`'s ancestor climb resolved under the same direction;
   * `null` when nothing is resident there or the body is not engaged. A
   * debug readout: the height alone cannot tell "sea level" from "no tile".
   */
  residentHeightLevelAt(
    bodyId: SceneBodyId,
    dirBodyFixed: Readonly<Vec3>,
    params: SurfaceTilePlannerParams | null,
  ): number | null;

  /** The albedo atlas's view, or `null` while nothing is engaged. */
  getAtlasView(): GPUTextureView | null;

  /** The HEIGHT atlas's view (Terrain-RGB `rgba8unorm`, 129-post slots,
   *  decoded in the shader), or `null` while nothing is engaged. */
  getHeightAtlasView(): GPUTextureView | null;

  /** Residency counts for the DebugPanel's low-rate poll; the plan's half
   *  (`plan`, `subCamera`) comes from the frame's `SurfaceTilePlan`. */
  debugStats(): Omit<SurfaceTileDebugSnapshot, 'plan' | 'subCamera'>;
};
