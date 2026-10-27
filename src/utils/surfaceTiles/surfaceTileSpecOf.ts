/**
 * surfaceTileSpecOf — the `SURFACE_TILE_REGISTRY` row for `id`, or null when the
 * id has none. The guard narrows to an intersection the literal-typed registry
 * cannot index, so the key is widened to the plain `SurfaceTileBodyId` first.
 */

import { SURFACE_TILE_REGISTRY } from '../../data/bodies/surfaceTileRegistry';
import { isSurfaceTileBodyId } from './isSurfaceTileBodyId';
import type { PositionedId } from '../../@types/scene/PositionedId';
import type { SurfaceTileBodyId } from '../../@types/data/SurfaceTileBodyId';
import type { SurfaceTileSpec } from '../../@types/data/SurfaceTileSpec';

export function surfaceTileSpecOf(id: PositionedId): SurfaceTileSpec | null {
  if (!isSurfaceTileBodyId(id)) return null;
  const key: SurfaceTileBodyId = id;
  return SURFACE_TILE_REGISTRY[key];
}
