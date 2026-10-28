import type { PositionedId } from '../../../@types/scene/PositionedId';
import type { CelestialBody } from '../../../@types/scene/CelestialBody';
import { SCENE_EARTH } from '../../../data/bodies/sceneEarth';
import { SCENE_PLANETS } from '../../../data/bodies/scenePlanets';

/**
 * The registry record for `bodyId` (Earth or a scene planet); missing ⇒ `null`.
 */
export function sceneBodyForId(bodyId: PositionedId): CelestialBody | null {
  if (SCENE_EARTH.id === bodyId) return SCENE_EARTH;
  return SCENE_PLANETS.find((p) => p.id === bodyId) ?? null;
}
