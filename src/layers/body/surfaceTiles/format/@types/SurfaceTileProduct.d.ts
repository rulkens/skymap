import type { SURFACE_TILE_PRODUCTS } from '../data/surfaceTileProducts';

/**
 * SurfaceTileProduct — which per-tile payload a `SurfaceTileId` names.
 * `'albedo'` is the imagery this virtual texture has always paged
 * (`EarthTileKind`'s old `'surface'`); `'height'` is F1's new Terrain-RGB
 * product (spec §5). Not `Extract<TextureKind, …>` like its predecessor:
 * a tiled height product has no whole-globe `TextureKind` counterpart to
 * weld onto. Derived from `SURFACE_TILE_PRODUCTS` so the list lives once.
 */
export type SurfaceTileProduct = (typeof SURFACE_TILE_PRODUCTS)[number];
