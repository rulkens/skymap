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
 * Each kind's tier ceiling caps detail where higher resolution buys nothing:
 * Uranus and Neptune are near-featureless discs (`small`), Venus is unresolved
 * cloud (`medium`), everything else goes to `large` (8 k). Today every body has
 * only a `surface` kind whose ceiling is that value. `grayscaleTint` marks the
 * two USGS Galilean sources that ship single-channel — the tint restores a
 * plausible hue the mono map lacks; its presence is the mono-source marker
 * (spec §3).
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
  earth: { bodyId: 'earth', kinds: { surface: 'large' }, provenance: 'nasa' },
  mars: { bodyId: 'mars', kinds: { surface: 'large' }, provenance: 'sss' },
  jupiter: { bodyId: 'jupiter', kinds: { surface: 'large' }, provenance: 'sss' },
  saturn: { bodyId: 'saturn', kinds: { surface: 'large' }, provenance: 'sss' },
  // Uranus / Neptune are near-featureless discs — small is the highest useful tier.
  uranus: { bodyId: 'uranus', kinds: { surface: 'small' }, provenance: 'sss' },
  neptune: { bodyId: 'neptune', kinds: { surface: 'small' }, provenance: 'sss' },
  moon: { bodyId: 'moon', kinds: { surface: 'large' }, provenance: 'sss' },
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
