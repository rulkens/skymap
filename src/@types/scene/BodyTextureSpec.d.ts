import type { BodyTextureId } from '../data/BodyTextureId';
import type { Tier } from '../data/Tier';
import type { Vec3 } from '../math/Vec3';

/**
 * BodyTextureSpec — one textured body's row in `BODY_TEXTURE_REGISTRY`: the
 * authored facts that drive how its surface texture is *fetched* (as opposed to
 * how it is *oriented*, which lives in `RotationElements`).
 *
 * The `maxTier` ceiling exists because texture detail does not need to track the
 * galaxy-catalog tier one-for-one: Uranus and Neptune are near-featureless discs
 * whose highest useful resolution is `small` (2 k), while Venus tops out at
 * `medium` (its surface is cloud, imaged at limited resolution). The runtime
 * clamps the user's tier to this ceiling (`clampTier`) so a `large`-tier session
 * never requests an 8 k texture that does not exist, and the build/fetch tools
 * emit only the tiers `≤ maxTier`.
 *
 * `grayscaleTint` is a build-time colour applied to the two USGS Galilean-moon
 * sources that ship as single-channel (mono) maps — the tint restores a
 * plausible hue that the grayscale source lacks. It is absent for full-colour
 * sources, so its presence is itself the mono-source marker (spec §3).
 */

export type BodyTextureSpec = {
  /** The body this row textures — restates the registry key so a row is self-describing. */
  readonly bodyId: BodyTextureId;
  /** Highest tier this body has a texture for — `small`(2k) | `medium`(4k) | `large`(8k). */
  readonly maxTier: Tier;
  /** Upstream provider: `sss` (Solar System Scope), `usgs`, or `nasa` (Blue Marble). */
  readonly provenance: 'sss' | 'usgs' | 'nasa';
  /** Build-time tint for a mono/grayscale source — present iff the source is single-channel. */
  readonly grayscaleTint?: Vec3;
};
