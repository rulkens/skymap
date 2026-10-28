/**
 * heliocentricPlanet — row maker for a HELIOCENTRIC planet: builds its
 * identity-only record. Position and orientation are NOT baked here — they are
 * derived per sim-instant from the same `ORBITAL_ELEMENTS` table by
 * `deriveBodyStates` (the trail this body sits on reads the one table too, so
 * body and trail stay on the same ellipse). Moons are NOT built through this —
 * they are geocentric (`satelliteBody`).
 *
 * Lives beside the body rows in `bodies/`: authoring policy only the body Layer's rows use.
 */

import { BODY_GLINT_MAX_PX } from '../../../../data/bodies/bodyGlintMaxPx';
import type { BodySpec } from '../../../../@types/scene/BodySpec';
import type { PlanetBody } from '../../../../@types/scene/PlanetBody';
import { asSceneBodyId } from '../../../../utils/scene/asSceneBodyId';

export function heliocentricPlanet(spec: BodySpec): PlanetBody {
  return {
    id: asSceneBodyId(spec.id),
    label: spec.label,
    surface: { datumRadiusM: spec.datumRadiusM, reliefM: spec.reliefM ?? [0, 0] },
    albedo: spec.albedo,
    resolvePx: BODY_GLINT_MAX_PX,
  };
}
