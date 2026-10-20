/**
 * bodyGroundRadiusAtM — the camera's ground radius: datum plus terrain, or for a
 * shape-model body (no height lookup) the bounding sphere, so the camera never
 * enters the mesh but floats above its low ends.
 */

import type { CelestialBody } from '../../@types/scene/CelestialBody';
import { meshPresentationOf } from '../meshBodies/meshPresentationOf';
import { outerBoundRadiusM } from '../occlusion/outerBoundRadiusM';

export function bodyGroundRadiusAtM(body: CelestialBody, terrainM: number): number {
  return meshPresentationOf(body.id) === null
    ? body.surface.datumRadiusM + terrainM
    : outerBoundRadiusM(body.surface);
}
