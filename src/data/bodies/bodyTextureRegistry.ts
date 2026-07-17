/**
 * bodyTextureRegistry — the single authored table of textured bodies and how
 * each body's surface texture is sized, sourced, and tinted.
 *
 * ### One table, three consumers
 *
 * This registry is deliberately the *only* place the textured-body set is
 * enumerated. Three otherwise-independent parts of the system read it:
 *
 *  - the **runtime tier clamp** — `clampTier(userTier, spec.maxTier)` keeps the
 *    proximity loader from requesting a resolution a body has no file for;
 *  - the **build tier-set** — the texture tool emits only the tiers `≤ maxTier`;
 *  - the **fetch source-list** — the fetcher walks the keys to know which bodies
 *    to pull, and `provenance` / `grayscaleTint` tell it where from and whether
 *    to tint a mono source.
 *
 * Because all three derive from this one table, adding a textured body is a
 * single row here (plus its id in the `BodyTextureId` union and its raw-data
 * entries) — never a coordinated edit across three parallel lists. That is the
 * whole reason texture identity lives in registry membership rather than a baked
 * per-body `textured` flag (spec §4.2/§4.3).
 *
 * ### Ceilings and tints
 *
 * `maxTier` caps detail where higher resolution buys nothing: Uranus and Neptune
 * are near-featureless discs (`small`), Venus is unresolved cloud (`medium`),
 * everything else goes to `large` (8 k). `grayscaleTint` marks the two USGS
 * Galilean sources that ship single-channel — the tint restores a plausible hue
 * the mono map lacks; its presence is the mono-source marker (spec §3).
 */

import type { BodyTextureId } from '../../@types/data/BodyTextureId';
import type { BodyTextureSpec } from '../../@types/scene/BodyTextureSpec';

/**
 * Every textured body keyed by its id. A `Record<BodyTextureId, …>` (not an
 * array) so a missing or extra key is a compile error and lookup is O(1) — the
 * proximity loader hits this per body per frame.
 */
export const BODY_TEXTURE_REGISTRY: Readonly<
  Record<BodyTextureId, BodyTextureSpec>
> = {
  // Solar System Scope full-colour maps for the eight planets + the Moon; NASA
  // Blue Marble for Earth; USGS single-channel maps for the four Galilean moons.
  mercury: { bodyId: 'mercury', maxTier: 'large', provenance: 'sss' },
  // Venus tops out at medium — the source is unresolved cloud, no 8 k detail exists.
  venus: { bodyId: 'venus', maxTier: 'medium', provenance: 'sss' },
  earth: { bodyId: 'earth', maxTier: 'large', provenance: 'nasa' },
  mars: { bodyId: 'mars', maxTier: 'large', provenance: 'sss' },
  jupiter: { bodyId: 'jupiter', maxTier: 'large', provenance: 'sss' },
  saturn: { bodyId: 'saturn', maxTier: 'large', provenance: 'sss' },
  // Uranus / Neptune are near-featureless discs — small is the highest useful tier.
  uranus: { bodyId: 'uranus', maxTier: 'small', provenance: 'sss' },
  neptune: { bodyId: 'neptune', maxTier: 'small', provenance: 'sss' },
  moon: { bodyId: 'moon', maxTier: 'large', provenance: 'sss' },
  io: { bodyId: 'io', maxTier: 'large', provenance: 'usgs' },
  // Europa + Callisto: USGS mono maps — tinted at build time to restore hue.
  europa: {
    bodyId: 'europa',
    maxTier: 'large',
    provenance: 'usgs',
    grayscaleTint: [0.86, 0.82, 0.74],
  },
  ganymede: { bodyId: 'ganymede', maxTier: 'large', provenance: 'usgs' },
  callisto: {
    bodyId: 'callisto',
    maxTier: 'large',
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
  return (
    (BODY_TEXTURE_REGISTRY as Record<string, BodyTextureSpec | undefined>)[id] ??
    null
  );
}
