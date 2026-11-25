import type { TileStreamSubsystem } from '../../../../../@types/engine/subsystems/tileStreamSubsystem/TileStreamSubsystem';
import type { TextureAtlas } from '../../../../../services/gpu/resources/textureAtlas';
import type { ResidentSurfaceTile } from './ResidentSurfaceTile';
import type { SurfaceTilePayload } from './SurfaceTilePayload';

/**
 * SurfaceTileLane — one product's atlas stream and the residency read from it.
 * One per product because each atlas has its own slot geometry: a slot number
 * only means something beside the stream it came from.
 */
export type SurfaceTileLane = {
  readonly stream: TileStreamSubsystem<SurfaceTilePayload | 'empty', TextureAtlas>;
  readonly resident: Map<string, ResidentSurfaceTile>;
  /** Keys read as stored-empty. Kept across eviction: emptiness is the archive's
   *  fact, and forgetting it would re-request the key once LRU reclaims its slot. */
  readonly empty: Set<string>;
  /** key -> z, for the debug stats' per-level pending counts; cleared where the
   *  fetch resolves or its slot is evicted. */
  readonly pendingLevelOf: Map<string, number>;
  /** The one-time warning for an 'empty' read on a gates-cut lane has been logged. */
  warnedEmpty: boolean;
};
