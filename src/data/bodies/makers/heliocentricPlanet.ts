/**
 * heliocentricPlanet — row maker for a HELIOCENTRIC planet: builds its
 * identity-only record. Position and orientation are NOT baked here — they are
 * derived per sim-instant from the same `ORBITAL_ELEMENTS` table by
 * `deriveBodyStates` (the trail this body sits on reads the one table too, so
 * body and trail stay on the same ellipse). Moons are NOT built through this —
 * they are geocentric (`satelliteBody`).
 *
 * Lives beside `SCENE_PLANETS` in `makers/` rather than in `src/utils/`: it is
 * authoring policy, has a single consumer (the planets table), and maker and
 * table change together.
 */

import type { BodySpec } from '../../../@types/scene/BodySpec';
import type { PlanetBody } from '../../../@types/scene/PlanetBody';

export function heliocentricPlanet(spec: BodySpec): PlanetBody {
  return {
    id: spec.id,
    label: spec.label,
    radiusM: spec.radiusM,
    albedo: spec.albedo,
  };
}
