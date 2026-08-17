import type { BodyTextureId } from '../data/BodyTextureId';
import type { Tier } from '../data/Tier';
import type { TextureKind } from '../data/TextureKind';
import type { ColourTreatment } from './ColourTreatment';

/**
 * BodyTextureSpec — one textured body's row in `BODY_TEXTURE_REGISTRY`: the
 * authored facts that drive how its texture maps are *fetched* (as opposed to
 * how the body is *oriented*, which lives in `RotationElements`).
 *
 * `kinds` folds two facts into one home: *which* map roles this body has (its
 * present keys) and each role's *per-kind tier ceiling* (its values). Every body
 * has a `surface` (day/albedo) map; Earth-facing feature kinds
 * (`night`/`clouds`/`material`/`normal`) land per-body with their PRs. The
 * ceiling exists because texture detail need not track the galaxy-catalog tier
 * one-for-one: Uranus and Neptune are near-featureless discs whose highest useful
 * resolution is `small` (2 k), Venus tops out at `medium` (unresolved cloud), and
 * a mask (night/clouds) may cap lower than the colour surface (spec §9.2). The
 * runtime clamps the user's tier to a kind's ceiling (`clampTier`) so a session
 * never requests a resolution that does not exist, and the build/fetch tools emit
 * only the tiers `≤` that ceiling.
 *
 * `treatment` names, as a tag, how the build turns this body's raw albedo source
 * into sRGB — full-colour passthrough, or a tint multiplied into a mono source
 * (spec §3). Every row states it; nothing is inferred from a missing field.
 */

export type BodyTextureSpec = {
  /** The body this row textures — restates the registry key so a row is self-describing. */
  readonly bodyId: BodyTextureId;
  /**
   * The map roles this body has, each pointing at its highest tier
   * (`small`(2k) | `medium`(4k) | `large`(8k)). A present key means the body
   * ships that kind; every body has `surface`. Partial because most bodies have
   * only `surface` today.
   */
  readonly kinds: Readonly<Partial<Record<TextureKind, Tier>>>;
  /** Upstream provider: `sss` (Solar System Scope), `usgs`, or `nasa` (Blue Marble). */
  readonly provenance: 'sss' | 'usgs' | 'nasa';
  /** How the build colours this body's albedo source (per body, not per kind). */
  readonly treatment: ColourTreatment;
};
