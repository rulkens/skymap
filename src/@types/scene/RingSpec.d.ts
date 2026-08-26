import type { BodyTextureId } from '../data/BodyTextureId';
import type { RingTextureId } from '../data/RingTextureId';

/**
 * RingSpec — one planetary ring system's row in `SCENE_RINGS`: the authored
 * facts a ring renderer needs to draw an annulus that rides its host body.
 *
 * ### The ring plane IS the body's equatorial plane
 *
 * A ring is deliberately NOT given its own plane frame here. It reuses the host
 * body's baked `orientation` (local → equatorial-world rotation) and
 * `positionMpc` — a planet's rings lie in its equatorial plane by definition, so
 * storing a second frame would be a redundant copy that could drift out of sync
 * with the body it belongs to. `bodyId` names that host; the renderer looks the
 * body up and inherits its frame (spec §4.4).
 *
 * ### Radii stay in km
 *
 * `innerRadiusKm` / `outerRadiusKm` are the annulus edges in kilometres — the
 * native unit the ring system is quoted in — resolved to Mpc at draw time the
 * same way a body's `radiusM` (metres) is, so the authored numbers stay
 * human-readable and match the published Saturn ring dimensions.
 */

export type RingSpec = {
  /** Host body — the ring rides this body's baked `orientation` + `positionMpc`. */
  readonly bodyId: BodyTextureId;
  /** Inner annulus edge in km (Saturn: 74_500, the C-ring inner boundary). */
  readonly innerRadiusKm: number;
  /** Outer annulus edge in km (Saturn: 140_220, the A-ring outer boundary). */
  readonly outerRadiusKm: number;
  /** The ring-strip texture (with alpha) drawn across the annulus. */
  readonly textureId: RingTextureId;
};
