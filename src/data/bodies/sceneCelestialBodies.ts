import { SCENE_BODIES } from './sceneBodies';
import { isMeshBody } from '../../utils/scene/isMeshBody';
import type { CelestialBody } from '../../@types/scene/CelestialBody';

/**
 * SCENE_CELESTIAL_BODIES — `SCENE_BODIES` minus the mesh arm: the roster the
 * camera's altitude lane iterates. Derived, never hand-listed, so seeding a body
 * anywhere in `SCENE_BODIES` lands it here too. A mesh body is absent by
 * construction, which is what keeps it from ever owning the regime arm — its
 * bounding sphere is a hull, and an "altitude" measured against it would engage
 * the surface camera on the empty space beside a boom.
 */
export const SCENE_CELESTIAL_BODIES: readonly CelestialBody[] = SCENE_BODIES.filter(
  (body): body is CelestialBody => !isMeshBody(body),
);
