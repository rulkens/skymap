/**
 * fonts — the font registry.  Single source of truth for which fonts
 * exist, where their TTFs live on disk, what charset each bakes, and
 * the shared atlas-envelope numbers every font must fit into.
 *
 * ## Why a registry instead of one TS module per font?
 *
 * Before this file, the bake step (`tools/buildFontAtlas.ts`) and the
 * runtime loader (`src/services/gpu/labels/loadFontAtlas.ts`) each
 * hard-coded the font name in their own constants — `FONT_INPUT` on
 * the bake side, `FONT_BASE` on the runtime side.  Adding a second
 * font required editing both, getting the order right by hand, and
 * hoping the atlas envelope (size, distance range, font size) stayed
 * in sync between bake and load.  Encoding the registry once, here,
 * and re-importing on both sides makes drift structurally impossible
 * — the two callers literally read the same array.
 *
 * ## Why `as const` + `keyof typeof FONTS` rather than an enum?
 *
 * `FontId` needs to be a string-literal union so the `Label.font`
 * field can be type-narrowed by callers and lookups like
 * `metricsByFont[label.font]` are type-safe.  An enum widens to
 * `string` at the wire boundary; `as const` keeps every key narrow
 * forever.
 *
 * ## Why the atlas envelope lives here, not in buildFontAtlas.ts?
 *
 * The runtime loader needs `ATLAS_PX` too, indirectly via the
 * FontMetrics it parses out of the BMFont JSON — but a future
 * `assertAtlasDimensions` helper, plus the regression test in
 * `tests/tools/buildFontAtlas.test.ts`, both need to read these
 * numbers from a shared location.  Putting them in this file (which
 * both bake-side and runtime-side already import) avoids a third
 * "constants module" with no other content.
 *
 * ## Order of FONTS keys = GPU layer index
 *
 * `FONT_IDS[i]` is layer `i` in the `texture_2d_array<f32>` atlas
 * binding.  Reordering FONTS reorders the layers, which is a breaking
 * change — every consumer that pre-computed a `Record<FontId, number>`
 * from `FONT_IDS.indexOf(...)` needs to re-derive.  The order test in
 * `tests/data/fonts.test.ts` makes this explicit.
 */

/**
 * Atlas page dimensions in pixels.  Every font bakes into a single
 * `ATLAS_PX × ATLAS_PX` PNG; this becomes the per-layer size of the
 * runtime `texture_2d_array<f32>`.  512² fits the ASCII-printable +
 * `°±µ` charset at `ATLAS_FONT_SIZE` 42 with comfortable margin —
 * `assertAtlasDimensions` catches any future overflow at build time.
 */
export const ATLAS_PX = 512;

/**
 * MSDF distance range in pixels.  Controls how wide the signed-distance
 * field around each glyph edge extends.  The fragment shader's
 * `fwidth`-based smoothstep band is exactly one pixel wide for any
 * scale, regardless of this value — but a too-small range produces
 * visible banding at extreme upscales and a too-large range wastes
 * atlas pixels.  4 is the msdf-bmfont-xml default and reads cleanly
 * from 12 px (`Label.minPixelSize`) up to 64 px (`maxPixelSize`).
 */
export const DISTANCE_RANGE_PX = 4;

/**
 * Em-size of glyphs in atlas pixels at the source SDF resolution.
 * Higher means crisper edges but fewer glyphs per page; lower packs
 * more glyphs but blurs at extreme upscales.  42 is the
 * msdf-bmfont-xml convention for a 512² atlas with ~100 glyphs.
 */
export const ATLAS_FONT_SIZE = 42;

/**
 * ASCII printable: space (32) through tilde (126) — 95 characters.
 * Covers every Latin letter, digit, and punctuation mark we currently
 * render in labels (`'You are here'`, POI names, etc.).
 */
const ASCII_PRINTABLE = Array.from({ length: 95 }, (_, i) =>
  String.fromCodePoint(32 + i),
).join('');

/**
 * Extended unit symbols used in scale-bar / coordinate labels:
 *   °  degree sign (U+00B0)
 *   ±  plus-minus  (U+00B1)
 *   µ  micro       (U+00B5)
 *
 * Spec section "Open questions" locks the charset to this set.  Add
 * more here if a future producer needs them (and re-run the bake).
 */
const UNIT_SYMBOLS = '°±µ';

/**
 * Per-font configuration.  `ttf` is a filename relative to
 * `data/raw/fonts/`; `charset` is the union of codepoints the bake
 * step embeds in this font's atlas.
 */
export type FontConfig = {
  readonly ttf: string;
  readonly charset: string;
};

/**
 * The registry.  Adding a font is a three-step config change:
 *   1. Drop the TTF under `data/raw/fonts/`.
 *   2. Add a `<id>: { ttf, charset }` entry below.
 *   3. Run `npm run build-fonts` and `npm run sync-r2`.
 *
 * `as const` narrows every key to a string literal so `FontId` ends
 * up as a strict union (`'cormorant' | …`) rather than `string`.
 */
export const FONTS = {
  cormorant: {
    ttf: 'CormorantGaramond-SemiBold.ttf',
    charset: ASCII_PRINTABLE + UNIT_SYMBOLS,
  },
} as const satisfies Readonly<Record<string, FontConfig>>;

/**
 * Union of registered font ids.  Used by `Label.font`, `LoadedFontAtlases`,
 * the renderer's per-instance attribute packing — anywhere a font is
 * referenced by id.
 */
export type FontId = keyof typeof FONTS;

/**
 * Ordered list of font ids.  `FONT_IDS[i]` is the GPU layer index for
 * the font, both at upload time (renderer) and at sample time (shader).
 * Order matches declaration order of `FONTS` keys.
 */
export const FONT_IDS: readonly FontId[] = Object.keys(FONTS) as readonly FontId[];
