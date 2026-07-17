/**
 * sceneEarth — Earth (strictly the Earth–Moon barycentre) at its real J2000
 * mean heliocentric position, Earth-sized.
 *
 * DERIVED from `ORBITAL_ELEMENTS` — the single source of truth — via
 * `keplerianPositionMpc`, then anchored to the render origin (the Sun). A
 * placeholder position is not generally *on* the Keplerian ellipse the orbit
 * trail draws, so a hand-placed '1 AU along +x' literal would float the sphere
 * off its own trail. `keplerianPositionMpc` returns a focus-relative offset;
 * adding `RENDER_ORIGIN_MPC` keeps the seed correct if the heliocentric anchor
 * ever moves (ADR-0010 extension point).
 *
 * Earth keeps this bespoke derivation rather than going through
 * `heliocentricPlanet`: an `EarthBody` carries no flat `albedo` (it is always
 * textured — the Blue Marble rides the keyed `bodyTextures` slot family), where
 * a `PlanetBody` carries one, so the two do not share a maker. Its `orientation`
 * is baked from the same registry-keyed choice the planet makers use.
 */

import { RENDER_ORIGIN_MPC } from '../renderOrigin';
import { elementsById } from './orbitalElements';
import { orientationForBody } from './orientationForBody';
import { keplerianPositionMpc } from '../../utils/orbit/keplerianPositionMpc';
import { addVec3 } from '../../utils/math/addVec3';
import type { EarthBody } from '../../@types/scene/EarthBody';

export const SCENE_EARTH: EarthBody = {
  id: 'earth',
  label: 'Earth',
  positionMpc: addVec3(RENDER_ORIGIN_MPC, keplerianPositionMpc(elementsById('earth'))),
  radiusKm: 6371,
  orientation: orientationForBody('earth'),
};
