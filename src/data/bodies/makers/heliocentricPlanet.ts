/**
 * heliocentricPlanet — row maker for a HELIOCENTRIC planet: its focus is the
 * render origin (the Sun), so its world position is the render origin plus the
 * element table's `keplerianPositionMpc` offset — no hand-placed literals.
 *
 * The element table already carries each orbit's real inclination, so each body
 * sits exactly on the ellipse its trail draws (both read the one table). Moons
 * are NOT built through this — they are geocentric (`satelliteBody`).
 *
 * Lives beside `SCENE_PLANETS` in `makers/` rather than in `src/utils/`: it is
 * authoring policy, has a single consumer (the planets table), and maker and
 * table change together.
 */

import { RENDER_ORIGIN_MPC } from '../../renderOrigin';
import { elementsById } from '../orbitalElements';
import { keplerianPositionMpc } from '../../../utils/orbit/keplerianPositionMpc';
import { addVec3 } from '../../../utils/math/addVec3';
import type { BodySpec } from '../../../@types/scene/BodySpec';
import type { PlanetBody } from '../../../@types/scene/PlanetBody';

export function heliocentricPlanet(spec: BodySpec): PlanetBody {
  return {
    id: spec.id,
    label: spec.label,
    positionMpc: addVec3(RENDER_ORIGIN_MPC, keplerianPositionMpc(elementsById(spec.id))),
    radiusKm: spec.radiusKm,
    albedo: spec.albedo,
  };
}
