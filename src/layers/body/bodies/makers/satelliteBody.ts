/**
 * satelliteBody — row maker for a MOON's identity-only record (Earth's Moon included). A moon
 * rides its parent planet's position, one hop in `deriveBodyStates`; there is no moon-of-a-moon.
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
