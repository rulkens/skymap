import { SURFACE_TILE_REGISTRY } from '../../data/bodies/surfaceTileRegistry';

/**
 * The closed set of bodies with a `SURFACE_TILE_REGISTRY` row — what
 * `baseLevelForTier`, `surfaceTilesEngaged` and the bake table key on.
 * Derived via `keyof typeof` so a new row widens the union for free instead
 * of a hand-typed list drifting from the registry.
 */
export type SurfaceTileBodyId = keyof typeof SURFACE_TILE_REGISTRY;
