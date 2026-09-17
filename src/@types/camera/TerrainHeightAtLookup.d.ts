import type { BodyId } from '../data/body/BodyId';
import type { Vec3 } from '../math/Vec3';

/** Terrain height above the datum, metres. `SurfaceTileSubsystem.terrainHeightAt`'s
 *  shape, threaded as a value so the pure derivations stay pure. */
export type TerrainHeightAtLookup = (bodyId: BodyId, dirBodyFixed: Readonly<Vec3>) => number;
