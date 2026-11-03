/**
 * heliocentricPlanet — row maker for a HELIOCENTRIC planet's identity-only record; position
 * comes from `ORBITAL_ELEMENTS` via `deriveBodyStates`. Moons are geocentric: `satelliteBody`.
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
    captionKind: 'planet',
  };
}
