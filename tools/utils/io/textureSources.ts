/**
 * textureSources — the single home for "which raw file feeds each body/ring
 * texture", keyed by the same `(family key, kind)` space the runtime uses.
 *
 * ### One table, two derived views
 *
 * The offline pipeline has two halves that each need to know a body's raw
 * source: `fetchTextures` (download the raws) and `buildTextures` (tier them
 * into the runtime files). Before this table each authored its own list —
 * `fetchTextures`'s `SSS_BODIES`/`USGS_KEYS` keyed by raw-data key, and
 * `buildTextures`'s `BODY_SOURCE_KEYS` keyed by body id — so adding a textured
 * body could compile clean while the fetch list silently omitted it: the raw
 * never downloaded, the build logged a skip, and the body rendered untextured
 * with no error. Both halves now derive from THIS table instead.
 *
 * ### Keyed by the runtime family key — drift becomes a type error
 *
 * The top-level key is `BodyTextureId | RingTextureId` — the exact key space of
 * `ALL_BODY_TEXTURE_KEYS`. `satisfies Record<…>` makes a missing body/ring key a
 * COMPILE error, and the drift test (`textureSources.test.ts`) makes a body with
 * no `surface` source a RED test — never a silent untextured render.
 *
 * The second-level key is `TextureKind` (Prep 1's `'surface' | 'night' |
 * 'clouds' | 'material' | 'normal'`). Today every entry populates only `surface`
 * (the ring's one map is `surface` too); `Partial<…>` leaves room for Earth's
 * future `night`/`clouds`/`material`/`normal` source rows to be added ONCE, here
 * — the payoff this table exists for.
 *
 * ### Why `as const satisfies` (not a bare annotation)
 *
 * The fetch reads `RAW_DATA[native].upstream`, and `upstream` is OPTIONAL on the
 * `RawDataEntry` union — it only narrows to `string` when `native` is a string
 * LITERAL, not the widened `RawDataKey`. `as const` keeps every `native`/`devKey`
 * a literal so that narrowing survives; `satisfies` still enforces the
 * completeness + shape check. Same trick `RAW_DATA` itself uses.
 */

import type { BodyTextureId } from '../../../src/@types/data/BodyTextureId';
import type { RingTextureId } from '../../../src/@types/data/RingTextureId';
import type { TextureKind } from '../../../src/@types/data/TextureKind';
import type { RawDataKey } from './rawDataRegistry';

/**
 * The raw sources for one `(body|ring, kind)` texture. `native` is the full-res
 * registry row; the dev source (a `--dev` fetch's smaller candidate) is EITHER
 * its own registry row (`devKey` — Earth's BMNG sibling) OR a loose file in
 * `textures.dir` (`devFilename` — the SSS bodies and the ring, whose 2k variants
 * are not their own registry rows). A source with no dev variant (the USGS
 * moons) carries neither.
 *
 * `chroma` is the SECOND input a `panSharpen` body needs: `native` supplies the
 * luminance, `chroma` the hue.
 */
export type TextureSourceEntry = {
  readonly native: RawDataKey;
  readonly devKey?: RawDataKey;
  readonly devFilename?: string;
  readonly chroma?: RawDataKey;
};

/**
 * Every textured body + ring → its raw sources per kind. The values are the
 * exact superset of the two former tables. Note Uranus/Neptune keep a
 * `devFilename` even though their native IS the 2k file: the dev pull still
 * lists them (the swap resolves to the native path, so never fetched twice),
 * and on the build side the extra dev candidate resolves to the same on-disk
 * path as native — behavior-neutral both ways.
 */
export const TEXTURE_SOURCES = {
  mercury: { surface: { native: 'textures.sssMercury8k', devFilename: '2k_mercury.jpg' } },
  venus: { surface: { native: 'textures.sssVenus4k', devFilename: '2k_venus_atmosphere.jpg' } },
  earth: {
    surface: { native: 'textures.nasaBmng', devKey: 'textures.nasaBmngDev' },
    // The night-lights (Black Marble) map. Full-pull only — no cheap dev variant,
    // like `material` below — so `--dev` fetch/build skip it; the Task 4 visual
    // check needs the full night source.
    night: { native: 'textures.earthNight' },
    // The material (roughness/ocean-mask) map derives from the NASA land/water
    // mask. Full-pull only — no cheap dev variant, so the mask is fetched only
    // on the real pull, never in the ~7 MB `--dev` subset.
    material: { native: 'textures.earthWaterMask' },
    // The normal (tangent-space relief) map. Its `native` names the ELEVATION
    // heightfield input, not the normal map's own pixels — the build BAKES a
    // Sobel gradient from the greyscale relief (see buildTextures' `normal`
    // writer); the row shape is identical to `material`'s, only the build writer
    // differs. Full-pull only — no cheap dev variant, like `material` — so a
    // `--dev` fetch/build skips it.
    normal: { native: 'textures.earthElevation' },
    // The cloud shell (sRGB colour + luminance-derived alpha → PNG). The NASA
    // Blue Marble cloud composite is white-cloud-on-black with no alpha; the
    // build derives opacity from luminance (see buildTextures' `clouds` writer).
    // Full-pull only — no cheap dev variant, like `material`/`normal`.
    clouds: { native: 'textures.earthClouds' },
  },
  mars: { surface: { native: 'textures.sssMars8k', devFilename: '2k_mars.jpg' } },
  jupiter: { surface: { native: 'textures.sssJupiter4k', devFilename: '2k_jupiter.jpg' } },
  saturn: { surface: { native: 'textures.sssSaturn4k', devFilename: '2k_saturn.jpg' } },
  uranus: { surface: { native: 'textures.sssUranus2k', devFilename: '2k_uranus.jpg' } },
  neptune: { surface: { native: 'textures.sssNeptune2k', devFilename: '2k_neptune.jpg' } },
  moon: {
    surface: { native: 'textures.sssMoon8k', devFilename: '2k_moon.jpg' },
    // The normal (tangent-space relief) map. Like Earth's, its `native` names the
    // ELEVATION heightfield input, not the normal map's own pixels — the build
    // BAKES a Sobel gradient from the LOLA relief. Full-pull only — the Moon
    // normal is not in the ~7 MB `--dev` subset, so a `--dev` fetch/build skips it.
    normal: { native: 'textures.moonElevation' },
  },
  io: { surface: { native: 'textures.usgsIo' } },
  europa: { surface: { native: 'textures.usgsEuropa' } },
  ganymede: { surface: { native: 'textures.usgsGanymede' } },
  callisto: { surface: { native: 'textures.usgsCallisto' } },
  // Pluto's chroma map is published as ENHANCED colour (see its RAW_DATA
  // comment); the registry row's `panSharpen` calibration undoes that.
  pluto: { surface: { native: 'textures.usgsPluto', chroma: 'textures.nasaPlutoColor' } },
  charon: { surface: { native: 'textures.usgsCharon' } },
  'saturn-ring': {
    surface: { native: 'textures.sssRing', devFilename: '2k_saturn_ring_alpha.png' },
  },
} as const satisfies Record<
  BodyTextureId | RingTextureId,
  Partial<Record<TextureKind, TextureSourceEntry>>
>;

/**
 * One value of `TEXTURE_SOURCES`, with `native` / `devKey` kept as string
 * LITERALS (not widened to `RawDataKey`) — the union of every authored entry
 * across all bodies AND kinds. Derived from `typeof TEXTURE_SOURCES` rather than
 * the `TextureSourceEntry` above, which is the WIDENED shape the table
 * `satisfies` (its `native: RawDataKey` throws the literal away). The literal is
 * load-bearing downstream: `RAW_DATA[entry.native]` then narrows to a texture
 * row — all of which carry `upstream` — instead of the whole registry union,
 * where `upstream` is optional. Both the fetch (`fetchTextures`) and build
 * (`buildTextures`) import THIS one derived form, so there is no per-consumer
 * twin alias to drift.
 */
export type TextureSourceRow = {
  [Body in keyof typeof TEXTURE_SOURCES]: (typeof TEXTURE_SOURCES)[Body][keyof (typeof TEXTURE_SOURCES)[Body]];
}[keyof typeof TEXTURE_SOURCES];
