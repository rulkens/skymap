/**
 * fonts — the font registry.  Single source of truth for which fonts
 * exist, where their TTFs live on disk, what charset each bakes, and
 * the shared atlas-envelope numbers every font must fit into.
 *
 * ## Why a registry instead of one TS module per font?
 *
 * The bake step (`tools/buildFontAtlas.ts`) and the runtime loader
 * (`src/services/gpu/labels/loadFontAtlas.ts`) both need the font
 * list.  Per-side constants would mean adding a font requires
 * parallel edits, getting the order right by hand, and hoping the
 * atlas envelope (size, distance range, font size) stays in sync
 * between bake and load.  Encoding the registry once, here, and
 * re-importing on both sides makes drift structurally impossible
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

import type { FontConfig } from '../@types/data/FontConfig';
import type { FontId } from '../@types/data/FontId';

/**
 * Atlas page dimensions in pixels.  Every font bakes into a single
 * `ATLAS_PX × ATLAS_PX` PNG; this becomes the per-layer size of the
 * runtime `texture_2d_array<f32>`.  1024² fits the ASCII-printable +
 * `°±µ` charset at `ATLAS_FONT_SIZE` 84 with comfortable margin —
 * `assertAtlasDimensions` catches any future overflow at build time.
 */
export const ATLAS_PX = 1024;

/**
 * MSDF distance range in pixels.  Controls how wide the signed-distance
 * field around each glyph edge extends, i.e. the maximum off-edge
 * distance the atlas can faithfully encode.  The body-fill fragment
 * shader's `fwidth`-based smoothstep band is exactly one pixel wide
 * for any scale regardless of this value — but outline and glow
 * effects sample the SDF *past* the glyph contour, and any distance
 * beyond `±DISTANCE_RANGE_PX / 2` clamps at the texel boundary,
 * cutting off the falloff tail.
 *
 * 32 is sized for the per-label outline + glow pass, scaled to the
 * 84 px atlas em.  The outline band samples `outlineEmFrac` (0.16 em
 * = ~13.4 px) past the contour; ±16 px of encoded range keeps ~19%
 * margin past that worst-case extent while still fitting the
 * 95-glyph charset into the 1024² atlas.
 *
 * The ratio `DISTANCE_RANGE_PX / ATLAS_FONT_SIZE` is load-bearing:
 * shader-side SDF-units math (`widthInSdfUnits = (emFrac *
 * ATLAS_EM_PX) / DISTANCE_RANGE_PX`) bakes both constants in, so the
 * pair must scale together — and a *larger* ratio squeezes thin
 * strokes.  A hairline stroke's SDF peaks at
 * (strokeHalfWidth / DISTANCE_RANGE_PX) above the 0.5 fill
 * threshold; at the old 42 px em with range 16 that headroom was
 * ~0.05, and msdfgen's error at sub-2-texel features pushed sections
 * of Cormorant's hairlines below 0.5, baking visible gaps into
 * glyphs like C, G, and S.  Doubling em and range together keeps the
 * outline math identical while resolving hairlines at ~3 texels,
 * which removes the baked-in breakups.  Changing either constant
 * requires regenerating the atlas via `npm run build-fonts`.
 */
export const DISTANCE_RANGE_PX = 32;

/**
 * Em-size of glyphs in atlas pixels at the source SDF resolution.
 * Higher means crisper edges but fewer glyphs per page; lower packs
 * more glyphs but blurs at extreme upscales.  84 gives Cormorant
 * Garamond's hairline strokes ~3 texels of resolution — enough for
 * msdfgen to encode them without dropping below the 0.5 fill
 * threshold (at 42 they were ~1.5 texels and glyphs baked with
 * disconnected pieces).  Scale DISTANCE_RANGE_PX with this value.
 */
export const ATLAS_FONT_SIZE = 84;

/**
 * ASCII printable: space (32) through tilde (126) — 95 characters.
 * Covers every Latin letter, digit, and punctuation mark we currently
 * render in labels (`'You are here'`, structure names, etc.).
 */
const ASCII_PRINTABLE = Array.from({ length: 95 }, (_, i) => String.fromCodePoint(32 + i)).join('');

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
 * Ordered list of font ids.  `FONT_IDS[i]` is the GPU layer index for
 * the font, both at upload time (renderer) and at sample time (shader).
 * Order matches declaration order of `FONTS` keys.
 */
export const FONT_IDS: readonly FontId[] = Object.keys(FONTS) as readonly FontId[];
