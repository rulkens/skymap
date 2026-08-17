/**
 * bodyTextureRegistry — the single authored table of textured bodies and how
 * each body's surface texture is sized, sourced, and coloured.
 *
 * ### The single home for texture identity
 *
 * This registry is deliberately the *only* place the textured-body set is
 * enumerated for the runtime and the build. It is the single home for a body's
 * texture identity, its per-tier resolution ceiling, and its colour treatment.
 * Two parts of the system derive from it:
 *
 *  - the **runtime tier clamp** — `clampTier(userTier, spec.kinds[kind])` keeps
 *    the proximity loader from requesting a resolution a body has no file for;
 *  - the **build tier-set** — the texture tool emits only the tiers `≤` a kind's
 *    ceiling, and dispatches on `treatment.kind` for how to colour the source.
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
 * ### Ceilings and colour treatments
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
 * values above. `treatment` is the orthogonal axis: `{ kind: 'colour' }` for a
 * source that is already RGB, `{ kind: 'monoTint', tint }` for a USGS
 * single-channel mosaic with no colour source at all — the two Galilean moons
 * and Charon — where the tint restores a plausible hue the mono map lacks
 * (spec §3), and `{ kind: 'panSharpen', calibration }` for Pluto, whose mono
 * mosaic is paired with a co-registered colour map so hue is derived instead.
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
  // Blue Marble for Earth; USGS maps for the four Galilean moons, Pluto, and Charon.
  mercury: {
    bodyId: 'mercury',
    kinds: { surface: 'large' },
    provenance: 'sss',
    treatment: { kind: 'colour' },
  },
  // Venus tops out at medium — the source is unresolved cloud, no 8 k detail exists.
  venus: {
    bodyId: 'venus',
    kinds: { surface: 'medium' },
    provenance: 'sss',
    treatment: { kind: 'colour' },
  },
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
    treatment: { kind: 'colour' },
  },
  mars: {
    bodyId: 'mars',
    kinds: { surface: 'large' },
    provenance: 'sss',
    treatment: { kind: 'colour' },
  },
  // Jupiter / Saturn: source ceiling, not a look ceiling — see header. The
  // `8k_` source files are actually 4096×2048; `large` has no tile to load.
  jupiter: {
    bodyId: 'jupiter',
    kinds: { surface: 'medium' },
    provenance: 'sss',
    treatment: { kind: 'colour' },
  },
  saturn: {
    bodyId: 'saturn',
    kinds: { surface: 'medium' },
    provenance: 'sss',
    treatment: { kind: 'colour' },
  },
  // Uranus / Neptune are near-featureless discs — small is the highest useful tier.
  uranus: {
    bodyId: 'uranus',
    kinds: { surface: 'small' },
    provenance: 'sss',
    treatment: { kind: 'colour' },
  },
  neptune: {
    bodyId: 'neptune',
    kinds: { surface: 'small' },
    provenance: 'sss',
    treatment: { kind: 'colour' },
  },
  // The Moon carries a `normal` (tangent-space relief) map beyond its albedo:
  // BAKED from the LOLA elevation heightfield, capped at `medium` (4k) like
  // Earth's — a normal map downsamples cleanly, so 4k is the useful ceiling.
  moon: {
    bodyId: 'moon',
    kinds: { surface: 'large', normal: 'medium' },
    provenance: 'sss',
    treatment: { kind: 'colour' },
  },
  io: {
    bodyId: 'io',
    kinds: { surface: 'large' },
    provenance: 'usgs',
    treatment: { kind: 'colour' },
  },
  // Europa + Callisto: USGS mono maps — tinted at build time to restore hue.
  europa: {
    bodyId: 'europa',
    kinds: { surface: 'large' },
    provenance: 'usgs',
    treatment: { kind: 'monoTint', tint: [0.86, 0.82, 0.74] },
  },
  ganymede: {
    bodyId: 'ganymede',
    kinds: { surface: 'large' },
    provenance: 'usgs',
    treatment: { kind: 'colour' },
  },
  callisto: {
    bodyId: 'callisto',
    kinds: { surface: 'large' },
    provenance: 'usgs',
    treatment: { kind: 'monoTint', tint: [0.62, 0.58, 0.52] },
  },
  // Pluto / Charon: medium is a LOOK ceiling, not a source ceiling — sources
  // measure 24888px/12693px, well past 8k; the far-side coverage gap (only the
  // encounter hemisphere is well-resolved) is a fidelity caveat, not the tier
  // driver. Both sources measured single-channel (`sharp(...).metadata()`:
  // channels=1, space=b-w).
  //
  // Pluto gets `panSharpen`: a co-registered global chroma source exists (NASA's
  // MVIC colour map, PIA11707), so hue is derived rather than guessed instead of
  // flat-tinted (calibration provenance is on `ChromaCalibration`). Charon stays
  // `monoTint`: no global colour map exists for it, only single-hemisphere disc
  // portraits, and it is genuinely near-neutral but for a small reddish polar
  // cap (Grundy+16, Science 351 aad9189) — a flat tint is what its source
  // supports, not a shortfall against Pluto's treatment.
  pluto: {
    bodyId: 'pluto',
    kinds: { surface: 'medium' },
    provenance: 'usgs',
    treatment: {
      kind: 'panSharpen',
      // Re-derive or re-check these four: `npm run fit-pluto-chroma`. Expect the
      // digits to drift ~1% — the fit averages gradient-quiet tiles, so the tile
      // population moves with the reference rendition's noise floor, and the one
      // these were fitted from is gone. The tool gates on outcome instead: these
      // must stay within half a delta-E of a fresh fit (3.16 vs 3.13 today) and
      // still beat the uniform-scale baseline (7.02). Re-fit only if that fails.
      calibration: {
        matrix: [
          [1.0354, 0.3565],
          [-0.0686, 0.1579],
        ],
        gain: 0.958,
      },
    },
  },
  charon: {
    bodyId: 'charon',
    kinds: { surface: 'medium' },
    provenance: 'usgs',
    treatment: { kind: 'monoTint', tint: [0.6, 0.58, 0.56] },
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
