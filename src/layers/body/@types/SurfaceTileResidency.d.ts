/**
 * SurfaceTileResidency — the tile stream's read side, handed to the pure
 * planner. Read-only: the stream alone owns the atlases, LRU and fetch
 * queue, as `OctreeChunkStream` does for the star octree. Every query
 * answers for the engaged body's atlases.
 */

import type { SurfaceTileId } from '../../../@types/data/SurfaceTileId';
import type { SurfaceTileBodyId } from '../../../@types/data/SurfaceTileBodyId';
import type { SceneBodyId } from '../../../@types/scene/SceneBodyId';
import type { SurfaceTileManifest } from '../../../@types/scene/SurfaceTileManifest';
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
  isInFlight(tile: SurfaceTileId): boolean;
  hasFailed(tile: SurfaceTileId): boolean;
  inFlightCount(): number;
  /** The body whose atlases are allocated, or null while none are. */
  engagedBodyId(): (SceneBodyId & SurfaceTileBodyId) | null;
};
