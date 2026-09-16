/**
 * SurfaceTileProduct — which per-tile payload a `SurfaceTileId` names.
 * `'albedo'` is the imagery this virtual texture has always paged
 * (`EarthTileKind`'s old `'surface'`); `'height'` is F1's new Terrain-RGB
 * product (spec §5). Not `Extract<TextureKind, …>` like its predecessor:
 * a tiled height product has no whole-globe `TextureKind` counterpart to
 * weld onto.
 */
export type SurfaceTileProduct = 'albedo' | 'height';
