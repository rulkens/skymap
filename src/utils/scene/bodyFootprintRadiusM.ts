import type { SceneBody } from '../../@types/scene/SceneBody';
import { isMeshBody } from './isMeshBody';
import { outerBoundRadiusM } from './outerBoundRadiusM';

/**
 * bodyFootprintRadiusM — the radius of the sphere the body OCCUPIES, metres: a
 * celestial body's OUTER bound, a mesh body's baked bounding sphere. This is the
 * currency every extent reader wants (apparent size, glint size, slab near plane,
 * label em, load radius), and the outer bound is the safe direction for all of
 * them: over-estimating wastes a little screen area, under-estimating clips a peak
 * out of whatever the extent was meant to contain. Shells (atmosphere, cloud deck,
 * rings) are NOT included; `bodyDrawRadiusM` adds those on top.
 */
export function bodyFootprintRadiusM(body: SceneBody): number {
  return isMeshBody(body) ? body.boundingRadiusM : outerBoundRadiusM(body.surface);
}
