import type { BodyId } from '../data/body/BodyId';
import type { Vec3 } from '../math/Vec3';

/**
 * Body-generic terrain height query (metres above the datum) — the shape of
 * `SurfaceTileSubsystem.terrainHeightAt`, threaded as a plain value into the
 * pure derivations that need it (F3a, spec §8.3) so their fixtures are one
 * closure rather than a subsystem mock.
 */
export type TerrainHeightAtLookup = (bodyId: BodyId, dirBodyFixed: Readonly<Vec3>) => number;
