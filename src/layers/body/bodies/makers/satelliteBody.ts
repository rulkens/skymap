/**
 * satelliteBody — row maker for a MOON: builds its identity-only record. Like
 * `heliocentricPlanet` it bakes no position — a moon's world position rides its
 * parent planet's current position and is derived per sim-instant by
 * `deriveBodyStates` (one parent hop; there is no moon-of-a-moon), reading the
 * same `ORBITAL_ELEMENTS` table. This maker subsumes Earth's Moon too.
 *
 * Lives beside the body rows in `bodies/`: authoring policy only the body Layer's rows use.
 */

import { BODY_GLINT_MAX_PX } from '../../../../data/bodies/bodyGlintMaxPx';
import type { BodySpec } from '../../../../@types/scene/BodySpec';
import type { PlanetBody } from '../../../../@types/scene/PlanetBody';
import { asSceneBodyId } from '../../../../utils/scene/asSceneBodyId';

export function satelliteBody(spec: BodySpec): PlanetBody {
  return {
    id: asSceneBodyId(spec.id),
    label: spec.label,
    surface: { datumRadiusM: spec.datumRadiusM, reliefM: spec.reliefM ?? [0, 0] },
    albedo: spec.albedo,
    resolvePx: BODY_GLINT_MAX_PX,
  };
}
