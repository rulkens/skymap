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
  readonly stream: TileStreamSubsystem<SurfaceTilePayload, TextureAtlas>;
  readonly resident: Map<string, ResidentSurfaceTile>;
  /** key -> z, for the debug stats' per-level pending counts; cleared where the
   *  fetch resolves or its slot is evicted. */
  readonly pendingLevelOf: Map<string, number>;
};
