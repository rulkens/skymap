import { SCENE_BODIES } from './sceneBodies';
import { isMeshBody } from '../../utils/scene/isMeshBody';
import type { CelestialBody } from '../../@types/scene/CelestialBody';

/**
 * SCENE_CELESTIAL_BODIES — `SCENE_BODIES` minus the mesh arm (see
 * `MeshBody.boundingRadiusM`), derived rather than hand-listed so a new body
 * lands here automatically.
 */
export const SCENE_CELESTIAL_BODIES: readonly CelestialBody[] = SCENE_BODIES.filter(
  (body): body is CelestialBody => !isMeshBody(body),
);
