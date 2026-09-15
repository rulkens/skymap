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
 * (`tools/textures/buildSurfaceTiles.ts`) are the fetch/bake floors.
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

/** Subdivision `n` per patch edge of the shared vertex-shader template.
 *  Independent of the height data's post spacing -- surplus height detail
 *  reaches the picture through the fragment-stage normal -- so raising this
 *  to 64 for displacement is a constant change, not a re-bake (spec §7). */
export const EARTH_SURFACE_TILE_MESH_RESOLUTION = 8;

/**
 * Base-globe descent-fade band, in camera altitude above the surface (km).
 * The detail-tile mesh fully covers the visible cap once resident, and the
 * base globe's non-RTC f32 depth jitters at low altitude, stochastically
 * punching through the tiles — so the globe fades out ahead of that fight.
 * 300 km completes the fade far above the few-km altitudes where the jitter
 * becomes visible; 150 km sits far below tile engagement, so tiles are
 * always resident by the time the globe is gone. See `baseGlobeFadeAlpha`.
 */
export const EARTH_BASE_GLOBE_FADE_FULL_ALTITUDE_KM = 300;

/** Lower edge (alpha 0) of the base-globe fade band — see
 *  `EARTH_BASE_GLOBE_FADE_FULL_ALTITUDE_KM`. */
export const EARTH_BASE_GLOBE_FADE_GONE_ALTITUDE_KM = 150;

/**
 * Crossfade duration, in milliseconds of REAL time (`performance.now()`,
 * never sim time -- a paused or scaled sim clock must not stall or distort
 * the fade), a freshly-landed detail tile takes to blend in over the
 * coarser ancestor imagery it replaces. Long enough to hide the graded-
 * differently band boundaries (BMNG-derived z4-7, EOX z8-13, GeoDanmark
 * z14-19) popping; short enough that a fast descent doesn't trail visible
 * ghosting. See `earthSurfaceTileRenderer.ts`'s per-tile weight and
 * `earthSurfaceTile/fragment.wesl`'s dual-sample mix.
 */
export const EARTH_TILE_CROSSFADE_MS = 400;
