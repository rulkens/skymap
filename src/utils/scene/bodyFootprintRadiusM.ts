import type { SceneBody } from '../../@types/scene/SceneBody';
import { isMeshBody } from './isMeshBody';

/**
 * bodyFootprintRadiusM — the radius of the sphere the body OCCUPIES, metres:
 * a celestial body's ground radius, a mesh body's baked bounding sphere. This is
 * the currency every extent reader wants (apparent size, glint size, slab near
 * plane, occluder sphere, label em, load radius) — none of them can stand on the
 * ground, so none of them may take `CelestialBody.radiusM`. Shells (atmosphere,
 * cloud deck, rings) are NOT included; `bodyDrawRadiusM` adds those on top.
 */
export function bodyFootprintRadiusM(body: SceneBody): number {
  return isMeshBody(body) ? body.boundingRadiusM : body.radiusM;
}
