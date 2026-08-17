/**
 * bodyTextureRegistry — the single authored table of textured bodies and how
 * each body's surface texture is sized, sourced, and tinted.
 *
 * ### The single home for texture identity
 *
 * This registry is deliberately the *only* place the textured-body set is
 * enumerated for the runtime and the build. It is the single home for a body's
 * texture identity, its per-tier resolution ceiling, and its mono-source tint.
 * Two parts of the system derive from it:
 *
 *  - the **runtime tier clamp** — `clampTier(userTier, spec.kinds[kind])` keeps
 *    the proximity loader from requesting a resolution a body has no file for;
 *  - the **build tier-set** — the texture tool emits only the tiers `≤` a kind's
 *    ceiling, and `provenance` / `grayscaleTint` tell it whether a source is mono
 *    and how to tint it.
 *
 * The offline fetch (`tools/fetch/fetchTextures.ts`) and build
 * (`tools/textures/buildTextures.ts`) both derive their raw-source sets from a
 * single `TEXTURE_SOURCES` table (`tools/utils/io/textureSources.ts`), keyed by
 * the same `(bodyId|ring, kind)` space this registry enumerates. A textured body
 * with no source is therefore a type/test failure — not a silent download-set
 * drift that renders the body untextured with no error.
 *
 * Because the runtime and build both derive from this one table, adding a
 * textured body is a single row here (plus its id in the `BodyTextureId` union
 * and its raw-data entries) — never a coordinated edit across parallel lists.
 * That is the whole reason texture identity lives in registry membership rather
 * than a baked per-body `textured` flag (spec §4.2/§4.3).
 *
 * ### Ceilings and tints
 *
 * A kind's tier ceiling is authored for one of two distinct reasons, and they
 * must not be conflated:
 *
 *  - a **look ceiling** caps detail where higher resolution would buy nothing
 *    even with a bigger source: Uranus and Neptune are near-featureless discs
 *    (`small`), Venus is unresolved cloud (`medium`). Everything else not
 *    listed below goes to `large` (8 k).
 *  - a **source ceiling** caps detail where the raw image itself tops out
 *    below `large`, regardless of what the surface would reward. Jupiter and
 *    Saturn are `medium` for this reason: their Solar System Scope source
 *    file is 4096×2048 despite its `8k_` filename prefix (Solar System
 *    Scope's naming, not the delivered resolution) — there is no `large`
 *    (8192) tile for the build to emit. Raising either back to `large`
 *    requires sourcing a genuinely higher-resolution image first; without
 *    that, it is a regression, not an upgrade.
 *
 * Today every body has only a `surface` kind whose ceiling is one of the two
 * values above. `grayscaleTint` marks the USGS mono sources — the two
 * Galilean moons plus Pluto and Charon all ship single-channel — the tint
 * restores a plausible hue the mono map lacks; its presence is the
 * mono-source marker (spec §3).
 *
 * Nothing here checks an authored ceiling against the source it names.
 * `tools/textures/tiersFittingSourceWidth.ts` measures the real pixel width
 * of each raw source at build time and emits only the tiers that fit — it
 * already computes the number this file should never exceed, but the two are
 * not cross-checked. An authored ceiling can drift above what the build can
 * emit (as it did for Jupiter and Saturn); the build then silently omits the
 * unreachable tile, the proximity loader 404s requesting it, and the body is
 * left permanently on the low-resolution boot-atlas tile with no error.
 */

import type { BodyTextureId } from '../../@types/data/BodyTextureId';
import type { BodyTextureSpec } from '../../@types/scene/BodyTextureSpec';

/**
 * Every textured body keyed by its id. A `Record<BodyTextureId, …>` (not an
 * array) so a missing or extra key is a compile error and lookup is O(1) — the
 * proximity loader hits this per body per frame.
 */
export const BODY_TEXTURE_REGISTRY: Readonly<Record<BodyTextureId, BodyTextureSpec>> = {
  // Solar System Scope full-colour maps for the eight planets + the Moon; NASA
  // Blue Marble for Earth; USGS single-channel maps for the four Galilean moons.
  mercury: { bodyId: 'mercury', kinds: { surface: 'large' }, provenance: 'sss' },
  // Venus tops out at medium — the source is unresolved cloud, no 8 k detail exists.
  venus: { bodyId: 'venus', kinds: { surface: 'medium' }, provenance: 'sss' },
  // Earth carries extra maps beyond its day albedo: a `night` (city lights) sRGB
  // JPG at the full `large` (8k) ceiling — the Black Marble source resolves fine
  // detail worth keeping — a `material` (roughness + ocean mask) packed linear
  // PNG capped at `medium` (4k), since the ocean/land boundary needs no 8k detail
  // and the mask source subsamples cleanly to 4k — a `normal` (tangent-space
  // relief) linear PNG, likewise `medium`: it is BAKED from the GEBCO elevation
  // heightfield and a normal map downsamples cleanly, so 4k is the useful ceiling
  // — and a `clouds` (sRGB colour + luminance-derived alpha) PNG shell at the full
  // `large` (8k) ceiling, since the composite resolves fine cloud structure.
  earth: {
    bodyId: 'earth',
    kinds: {
      surface: 'large',
      night: 'large',
      material: 'medium',
      normal: 'medium',
      clouds: 'large',
    },
    provenance: 'nasa',
  },
  mars: { bodyId: 'mars', kinds: { surface: 'large' }, provenance: 'sss' },
  // Jupiter / Saturn: source ceiling, not a look ceiling — see header. The
  // `8k_` source files are actually 4096×2048; `large` has no tile to load.
  jupiter: { bodyId: 'jupiter', kinds: { surface: 'medium' }, provenance: 'sss' },
  saturn: { bodyId: 'saturn', kinds: { surface: 'medium' }, provenance: 'sss' },
  // Uranus / Neptune are near-featureless discs — small is the highest useful tier.
  uranus: { bodyId: 'uranus', kinds: { surface: 'small' }, provenance: 'sss' },
  neptune: { bodyId: 'neptune', kinds: { surface: 'small' }, provenance: 'sss' },
  // The Moon carries a `normal` (tangent-space relief) map beyond its albedo:
  // BAKED from the LOLA elevation heightfield, capped at `medium` (4k) like
  // Earth's — a normal map downsamples cleanly, so 4k is the useful ceiling.
  moon: { bodyId: 'moon', kinds: { surface: 'large', normal: 'medium' }, provenance: 'sss' },
  io: { bodyId: 'io', kinds: { surface: 'large' }, provenance: 'usgs' },
  // Europa + Callisto: USGS mono maps — tinted at build time to restore hue.
  europa: {
    bodyId: 'europa',
    kinds: { surface: 'large' },
    provenance: 'usgs',
    grayscaleTint: [0.86, 0.82, 0.74],
  },
  ganymede: { bodyId: 'ganymede', kinds: { surface: 'large' }, provenance: 'usgs' },
  callisto: {
    bodyId: 'callisto',
    kinds: { surface: 'large' },
    provenance: 'usgs',
    grayscaleTint: [0.62, 0.58, 0.52],
  },
  // Pluto / Charon: medium is a LOOK ceiling, not a source ceiling — sources
  // measure 24888px/12693px, well past 8k; the far-side coverage gap (only the
  // encounter hemisphere is well-resolved) is a fidelity caveat, not the tier
  // driver. Both sources measured single-channel (`sharp(...).metadata()`:
  // channels=1, space=b-w); `grayscaleTint` is a reasoned calibration against
  // the Europa/Callisto idiom, not literal RGB extraction — Pluto reads
  // butterscotch-tan overall (Olkin+17, AJ 154 258), Charon is near-neutral but
  // for a small reddish polar cap (Grundy+16, Science 351 aad9189).
  pluto: {
    bodyId: 'pluto',
    kinds: { surface: 'medium' },
    provenance: 'usgs',
    grayscaleTint: [0.8, 0.7, 0.56],
  },
  charon: {
    bodyId: 'charon',
    kinds: { surface: 'medium' },
    provenance: 'usgs',
    grayscaleTint: [0.6, 0.58, 0.56],
  },
};

/**
 * Look up a body's texture spec by id, returning `null` for a body with no row.
 * This IS the "is this body textured?" predicate the body makers use (spec §4.2)
 * — reading the one registry rather than maintaining a second textured-id list.
 * The `string` parameter (not `BodyTextureId`) lets callers pass an arbitrary
 * body id and branch on the `null`; a textured id round-trips to its row.
 */
export function bodyTextureSpec(id: string): BodyTextureSpec | null {
  return (BODY_TEXTURE_REGISTRY as Record<string, BodyTextureSpec | undefined>)[id] ?? null;
}
