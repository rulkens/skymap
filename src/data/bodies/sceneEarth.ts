/**
 * sceneEarth — Earth's identity-only scene record (strictly the Earth–Moon
 * barycentre), Earth-sized.
 *
 * Earth's position and orientation are NOT baked here: they are derived per
 * sim-instant from `ORBITAL_ELEMENTS` — the single source of truth — by
 * `deriveBodyStates`, which anchors the Keplerian offset to the render origin
 * (the Sun) so Earth sits exactly on the ellipse its orbit trail draws.
 *
 * Earth keeps this bespoke record rather than going through `heliocentricPlanet`:
 * an `EarthBody` carries no flat `albedo` (it is always textured — the Blue
 * Marble rides the keyed `bodyTextures` slot family), where a `PlanetBody`
 * carries one, so the two do not share a maker.
 */

import type { EarthBody } from '../../@types/scene/EarthBody';

export const SCENE_EARTH: EarthBody = {
  id: 'earth',
  label: 'Earth',
  radiusM: 6371000,
};
