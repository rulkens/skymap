/**
 * SurfaceTileResidency — the tile stream's read side, handed to the pure
 * planner (and, from P8b, the passes and the terrain seam). Read-only: the
 * stream alone owns the atlases, LRU and fetch queue, as `OctreeChunkStream`
 * does for the star octree. Tile keys are `surfaceTilePath(tile, prefix)`.
 */

import type { SurfaceTileId } from '../../data/SurfaceTileId';
import type { SurfaceTileBodyId } from '../../data/SurfaceTileBodyId';
import type { SceneBodyId } from '../../scene/SceneBodyId';
import type { SurfaceTileManifest } from '../../scene/SurfaceTileManifest';
import type { ResidentSlot } from './ResidentSlot';

export type SurfaceTileResidency = {
  /** `'absent'` until a plan asks for it (`SurfaceTilePlan.wantManifest`);
   *  `'failed'` is final, so a 404 is never refetched. */
  manifest(bodyId: SurfaceTileBodyId): {
    readonly status: 'absent' | 'pending' | 'loaded' | 'failed';
    readonly value: SurfaceTileManifest | null;
  };
  /** The engaged body's tile whose bitmap has landed, else null. */
  residentSlot(tile: SurfaceTileId): ResidentSlot | null;
  /** Holds a slot whose fetch is still out. */
  isInFlight(key: string): boolean;
  hasFailed(key: string): boolean;
  inFlightCount(): number;
  /** The body whose atlases are allocated, or null while none are. */
  engagedBodyId(): (SceneBodyId & SurfaceTileBodyId) | null;
};
