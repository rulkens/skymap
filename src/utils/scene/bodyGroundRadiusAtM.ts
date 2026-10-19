/**
 * bodyGroundRadiusAtM — the radius the camera treats as ground under a direction:
 * the datum plus terrain, except for a body drawn from a shape model. Its mesh has
 * no height lookup, so its ground is the bounding sphere (`reliefM`'s outer bound)
 * everywhere: the camera can never enter the mesh, at the price of floating above
 * the low ends (spec 2026-10-19, "floor at the bounding sphere").
 */

import type { CelestialBody } from '../../@types/scene/CelestialBody';
import { meshPresentationOf } from '../meshBodies/meshPresentationOf';
import { outerBoundRadiusM } from '../occlusion/outerBoundRadiusM';

export function bodyGroundRadiusAtM(body: CelestialBody, terrainM: number): number {
  return meshPresentationOf(body.id) === null
    ? body.surface.datumRadiusM + terrainM
    : outerBoundRadiusM(body.surface);
}
