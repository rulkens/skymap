import type { SurfaceTileSubsystem } from '../../@types/engine/subsystems/SurfaceTileSubsystem';
import type { TerrainHeightAtLookup } from '../../@types/camera/TerrainHeightAtLookup';

/** The one "subsystem not up yet ⇒ datum only" miss rule, shared so `runFrame` and `engine.ts` cannot answer a miss differently. */
export function terrainHeightAtOf(subsystem: SurfaceTileSubsystem | null): TerrainHeightAtLookup {
  return (bodyId, dir) => subsystem?.terrainHeightAt(bodyId, dir) ?? 0;
}
