import type { BodyTextureId } from '../data/BodyTextureId';
import type { Tier } from '../data/Tier';
import type { TextureKind } from '../data/TextureKind';
import type { ColourTreatment } from './ColourTreatment';

/**
 * BodyTextureSpec — one textured body's row in `BODY_TEXTURE_REGISTRY`: the
 * authored facts driving how its texture maps are fetched. `kinds` folds which map roles a body has (present keys) into each role's tier
 * ceiling (values). The ceiling is per kind because texture detail need not track
 * the galaxy-catalog tier: Uranus and Neptune are near-featureless discs topping
 * out at `small` (2k), Venus at `medium`, a night/clouds mask may cap below its
 * colour surface (spec §9.2). The runtime clamps the user's tier to it
 * (`clampTier`); the build emits only tiers ≤ it.
 */

export type BodyTextureSpec = {
  readonly bodyId: BodyTextureId;
  readonly kinds: Readonly<Partial<Record<TextureKind, Tier>>>; // present key = body ships that kind; value = its highest tier, `small` 2k | `medium` 4k | `large` 8k
  readonly provenance: 'sss' | 'usgs' | 'nasa'; // Solar System Scope | USGS | NASA Blue Marble
  readonly treatment: ColourTreatment; // per body, not per kind
};
