import type { SceneBodyId } from '../scene/SceneBodyId';
import type { Vec3 } from '../math/Vec3';

/** Terrain height above the datum, metres. `SurfaceTileStream.heightAt`'s
 *  shape, threaded as a value so the pure derivations stay pure. */
export type TerrainHeightAtLookup = (bodyId: SceneBodyId, dirBodyFixed: Readonly<Vec3>) => number;
