/**
 * isSurfaceTileBodyId — does `id` have a `SURFACE_TILE_REGISTRY` row? Membership
 * is the predicate (the registry's header), and the guard is what lets a scene
 * id index the registry: its declaration stays a literal, so a row typo is a
 * compile error, which also makes it non-indexable by a plain `SceneBodyId`.
 */

import { SURFACE_TILE_REGISTRY } from '../../../../data/bodies/surfaceTileRegistry';
import type { SceneBodyId } from '../../../../@types/scene/SceneBodyId';
import type { SurfaceTileBodyId } from '../../../../@types/data/SurfaceTileBodyId';
import type { PositionedId } from '../../../../@types/scene/PositionedId';

export function isSurfaceTileBodyId(id: PositionedId): id is SceneBodyId & SurfaceTileBodyId {
  return id in SURFACE_TILE_REGISTRY;
}
