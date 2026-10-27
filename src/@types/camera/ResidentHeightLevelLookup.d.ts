import type { SceneBodyId } from '../scene/SceneBodyId';
import type { Vec3 } from '../math/Vec3';

/** The pyramid level a height sample actually came from, `null` if none is
 *  resident. `SurfaceTileStream.residentHeightLevelAt`'s shape, threaded as
 *  a value so the pure derivations stay pure (mirrors `TerrainHeightAtLookup`). */
export type ResidentHeightLevelLookup = (
  bodyId: SceneBodyId,
  dirBodyFixed: Readonly<Vec3>,
) => number | null;
