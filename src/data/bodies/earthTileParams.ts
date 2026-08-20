/**
 * earthTileParams — named constants for Earth's surface virtual texture,
 * shared by the walk (`cutSurfaceTiles`), the tile subsystem and the build
 * tool. Full rationale (cited inline as "Design N") lives in
 * docs/superpowers/specs/2026-07-28-earth-surface-virtual-texture.md.
 * Level `z`'s equirectangular width is `EARTH_EQUIRECT_BASE_WIDTH_PX << z`
 * texels; anchoring on 512 puts the three whole-globe tiers on the ladder
 * (2048=z2, 4096=z3, 8192=z4) and matches the WGS84/EOX ladder verbatim.
 * Three floors, none a constant here: BASE (`earthBaseLevelForTier`) is
 * the walk floor; REQUEST (`derivePlannerParams`) and BAKE
 * (`tools/textures/buildEarthTiles.ts`) are the fetch/bake floors.
 */

/** Full equirectangular width, in texels, of pyramid level 0. Level `z` is
 *  `EARTH_EQUIRECT_BASE_WIDTH_PX << z` wide and half that tall, so `z = 4` is
 *  exactly the 8192 × 4096 whole-globe texture the `large` tier binds.
 *  (Design 1.) */
export const EARTH_EQUIRECT_BASE_WIDTH_PX = 512;

/** Default tile edge in pixels; the manifest's `tilePx` is authoritative at
 *  runtime. Chosen over the source grid's 256 to quarter the object count.
 *  (Design 1.) */
export const EARTH_TILE_PX = 512;

/** Physical atlas edge in pixels: 8192 / 512 = 16 slots per row, 256 slots,
 *  268 MB. Deep z14–19 regional bands push the planner's pinned ancestor-chain
 *  working set past the old 64-slot ceiling; 8192 is also WebGPU's baseline
 *  maxTextureDimension2D, so no limit request is needed. (Design 6.) */
export const EARTH_TILE_ATLAS_SIDE = 8192;

/** Concurrent tile fetches. Matches the thumbnail queue's reasoning rather than
 *  the asset queue's: many small streaming fetches during flight (~33 KB each),
 *  not a handful of big one-shot boot fetches. (Design 4.) */
export const EARTH_TILE_CONCURRENCY = 4;

/** WGS84 equatorial circumference in metres — the numerator of every
 *  metres-per-texel figure on the ladder. */
export const EARTH_EQUATORIAL_CIRCUMFERENCE_M = 40075016.686;

/**
 * Levels COARSER than 1:1 texel-per-pixel the planner settles for (each
 * step quarters the tile count). A dev laptop wants ~107 tiles against a
 * 64-slot atlas at bias 0; bias 1 brings that to ~27 — the mip-bias
 * escalation virtual-texturing engines use on an oversubscribed cache,
 * rather than a bigger atlas. Fixed, not servoed: nothing to track while
 * the pyramid is one level deep.
 */
export const EARTH_TILE_LOD_BIAS = 1;

/** `bakeSurfaceTileMesh`'s grid subdivision per tile edge (Task 5, replacing
 *  the page-table window as the constant this file owns for the tile-detail
 *  path). 8 -> 64 quads / 384 corner-expanded vertices per tile: enough that
 *  the baked curvature doesn't facet at typical viewing distance (the normal
 *  map supplies fine relief on top), cheap enough that a frame's worth of
 *  cut tiles re-uploads in full every draw (see earthSurfaceTileRenderer.ts). */
export const EARTH_SURFACE_TILE_MESH_RESOLUTION = 8;

/** `createSurfaceTileMeshCache`'s LRU capacity, in distinct tile ids. Sized
 *  off the atlas's own slot count rather than picked independently: several
 *  leaves at different pyramid depths can share one resident ANCESTOR's
 *  atlas slot (the fallback `cutSurfaceTiles` resolves), so a frame's `cut`
 *  can list more distinct (z,x,y) meshes than the atlas has slots. 2x the
 *  atlas capacity is headroom against that fan-out while staying cheap --
 *  each entry is a handful of small typed arrays, not GPU memory. */
export const EARTH_SURFACE_TILE_MESH_CACHE_CAPACITY =
  2 * (EARTH_TILE_ATLAS_SIDE / EARTH_TILE_PX) ** 2;
