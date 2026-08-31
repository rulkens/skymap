/**
 * satelliteBody — row maker for a MOON: builds its identity-only record. Like
 * `heliocentricPlanet` it bakes no position — a moon's world position rides its
 * parent planet's current position and is derived per sim-instant by
 * `deriveBodyStates` (one parent hop; there is no moon-of-a-moon), reading the
 * same `ORBITAL_ELEMENTS` table. This maker subsumes Earth's Moon too.
 *
 * Lives beside `SCENE_PLANETS` in `makers/` rather than in `src/utils/`: it is
 * authoring policy, has a single consumer (the planets table), and maker and
 * table change together.
 */

import type { BodySpec } from '../../../@types/scene/BodySpec';
import type { PlanetBody } from '../../../@types/scene/PlanetBody';

export function satelliteBody(spec: BodySpec): PlanetBody {
  return {
    id: spec.id,
    label: spec.label,
    radiusM: spec.radiusM,
    albedo: spec.albedo,
  };
}
