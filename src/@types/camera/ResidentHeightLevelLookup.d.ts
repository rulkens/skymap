import type { BodyId } from '../data/body/BodyId';
import type { Vec3 } from '../math/Vec3';

/** The pyramid level a height sample actually came from, `null` if none is
 *  resident. `SurfaceTileSubsystem.residentHeightLevelAt`'s shape, threaded as
 *  a value so the pure derivations stay pure (mirrors `TerrainHeightAtLookup`). */
export type ResidentHeightLevelLookup = (
  bodyId: BodyId,
  dirBodyFixed: Readonly<Vec3>,
) => number | null;
