/**
 * earthTileParams — the named constants for Earth's surface virtual texture.
 *
 * One home for the pyramid geometry, the residency budget and the fade, shared
 * by the planner, the page-table builder, the tile subsystem and the build tool,
 * so none of them can drift onto a private literal. Sited beside
 * `earthSurfaceParams` and `cloudShellParams`, which play the same role for the
 * surface shading and the cloud shell.
 *
 * Full rationale for every value lives in
 * `docs/superpowers/specs/2026-07-28-earth-surface-virtual-texture.md`; the
 * design number each one comes from is cited inline so the argument is one grep
 * away rather than restated here.
 *
 * ## The level ladder
 *
 * Level `z` is the pyramid step whose full equirectangular width is
 * `EARTH_EQUIRECT_BASE_WIDTH_PX << z` texels. Anchoring the ladder on 512 puts
 * the three whole-globe surface tiers exactly on it — 2048 is z2, 4096 is z3,
 * 8192 is z4 — which is what lets the virtual texture be strictly additive on
 * top of an image that already exists rather than replacing it. It also happens
 * to be the WGS84 / EOX `TileMatrixSet` ladder verbatim, so a pyramid baked from
 * either candidate source needs no grid translation.
 *
 * ## Three floors, none of them a constant here
 *
 * The base level, the request floor and the bake floor answer separate
 * questions, and none of the three is a fact about the ladder alone:
 *
 *  - The BASE level is the density the whole-globe texture a session actually
 *    binds delivers, which is a function of that session's tier —
 *    `earthBaseLevelForTier`. It is the planner's walk floor and the level the
 *    engage gate compares `zWin` against.
 *  - The REQUEST floor is one finer than that base, or the shallowest level the
 *    manifest says was baked, whichever is deeper: `derivePlannerParams` derives
 *    it per session. Fetching at or above the base would re-download detail an
 *    already-bound image carries.
 *  - The BAKE floor is the shallowest level the tool emits, and it lives in
 *    `tools/textures/buildEarthTiles.ts` — the manifest is what tells the
 *    runtime about it, so deepening or shallowing the bake stays a data change.
 *
 * Collapsing the walk floor into the request floor is the tempting mistake: it
 * would root the walk at the shallowest baked level, so every plan would report
 * at least that level and the engage comparison would be true-by-construction
 * against its own floor — a feature that never turns on at any altitude, with no
 * error to show for it.
 *
 * ## Why the tile edge is 512 and not the source grid's 256
 *
 * Object count. A 512 px edge quarters it, and at z12 that is 2.4 M objects
 * against 9.7 M — the difference between an overnight R2 sync and a multi-day
 * one. Every 512 px tile is the exact 2 × 2 union of four 256 px source tiles,
 * so nothing is resampled to get there. `EARTH_TILE_PX` is only the DEFAULT:
 * the baked manifest carries the real value and the runtime reads it from there,
 * so revisiting the choice is a re-bake, not a code change.
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

/** Page-table window edge, in tiles at the finest currently-planned level.
 *  128 tiles across is roughly 2500 km of ground at the altitude where that
 *  level is required, against about 2000 km of visible ground — so the window
 *  covers the whole visible disc including the limb, with headroom. A full-grid
 *  page table would be 537 MB at z13; this one is 64 KB, which is what keeps the
 *  "rebuild whole, never patch" property affordable. (Design 2.) */
export const EARTH_TILE_WINDOW_SIDE = 128;

/** Physical atlas edge in pixels: 4096 / 512 = 8 slots per row, 64 slots, 67 MB.
 *  Against a working set of roughly 20 to 40 tiles, the headroom absorbs level
 *  transitions during motion. (Design 6.) */
export const EARTH_TILE_ATLAS_SIDE = 4096;

/** Concurrent tile fetches. Matches the thumbnail queue's reasoning rather than
 *  the asset queue's: many small streaming fetches during flight (~33 KB each),
 *  not a handful of big one-shot boot fetches. (Design 4.) */
export const EARTH_TILE_CONCURRENCY = 4;

/** Per-tile fade-in against the whole-globe base, in ms. The same duration the
 *  galaxy thumbnail crossfade uses. (Design 5.) */
export const EARTH_TILE_FADE_MS = 400;

/** WGS84 equatorial circumference in metres — the numerator of every
 *  metres-per-texel figure on the ladder. */
export const EARTH_EQUATORIAL_CIRCUMFERENCE_M = 40075016.686;

/**
 * Levels COARSER than one texel per screen pixel that the planner settles for.
 * `0` is the 1:1 point the level rule derives on its own; each step up quarters
 * the tile count the walk wants, because one level is a 2x reduction in linear
 * screen extent per patch and the walk is over a 2D grid.
 *
 * This is this codebase's spelling of Cesium's `maximumScreenSpaceError`: that
 * knob is a geometric error in pixels, and reducing its formula gives the same
 * mip rule with a `-log2(tau)` bias where `tau` is the error tolerance — one
 * rule, two constants. A dev laptop wants roughly 107 tiles against a 64-slot
 * atlas at bias 0; the virtual-texturing literature's answer to an
 * oversubscribed cache is this bias, not a bigger atlas or dropping tiles —
 * id Tech 5 calls it dynamic feedback LOD bias, Unreal
 * `bEnableResidencyMipMapBias`, Unity's automatic mipmap bias, and CesiumJS
 * ships its imagery chain targeting roughly one texel per TWO screen pixels
 * rather than 1:1. One level here brings ~107 down to ~27, fitting the atlas
 * with headroom, at the cost of a uniform one-level softening in place of the
 * scattered patches an oversubscribed cache falls back to instead.
 *
 * Fixed rather than servoed against resident-page count: the literature's
 * mechanism is a hysteretic controller with high and low water marks, which is
 * the escalation to reach for once a deeper pyramid makes demand swing between
 * frames. There is nothing for a controller to track while the pyramid is one
 * level deep, so a constant is the whole answer today.
 */
export const EARTH_TILE_LOD_BIAS = 1;
