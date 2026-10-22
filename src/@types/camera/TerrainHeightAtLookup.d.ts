import type { BodySourceId } from '../data/body/BodySourceId';
import type { Vec3 } from '../math/Vec3';

/** Terrain height above the datum, metres. `SurfaceTileSubsystem.terrainHeightAt`'s
 *  shape, threaded as a value so the pure derivations stay pure. */
export type TerrainHeightAtLookup = (bodyId: BodySourceId, dirBodyFixed: Readonly<Vec3>) => number;
