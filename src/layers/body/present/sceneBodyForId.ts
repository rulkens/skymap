import type { PositionedId } from '../../../@types/scene/PositionedId';
import type { CelestialBody } from '../../../@types/scene/CelestialBody';
import { SCENE_EARTH } from '../../../data/bodies/sceneEarth';
import { SCENE_PLANETS } from '../../../data/bodies/scenePlanets';

/**
 * The registry record for `bodyId`, searched across every store the body-slab
 * layers can seed a row from. Mirrors `sceneBodyStates`' own null-safety
 * (missing ⇒ `null`, never a crash) rather than assuming Earth.
 */
export function sceneBodyForId(bodyId: PositionedId): CelestialBody | null {
  if (SCENE_EARTH.id === bodyId) return SCENE_EARTH;
  return SCENE_PLANETS.find((p) => p.id === bodyId) ?? null;
}
