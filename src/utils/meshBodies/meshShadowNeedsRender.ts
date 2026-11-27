/**
 * meshShadowNeedsRender — whether a slot rendered for the unit sun direction `renderedSunMesh`
 * (mesh frame) is stale against `sunMesh`: moved past `MESH_SHADOW_RERENDER_COS`. A rover at
 * 1× time crosses it every ~25 s; a spinning self-hosted body (Bennu) most frames time runs.
 */

import type { Vec3 } from '../../@types/math/Vec3';
import { MESH_SHADOW_RERENDER_COS } from '../../data/mesh/meshShadowMap';
import { dot3 } from '../math/dot3';

export function meshShadowNeedsRender(
  renderedSunMesh: Readonly<Vec3>,
  sunMesh: Readonly<Vec3>,
): boolean {
  return dot3(renderedSunMesh, sunMesh) < MESH_SHADOW_RERENDER_COS;
}
