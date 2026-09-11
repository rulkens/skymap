/**
 * meshBodyLoadRadius — the per-mesh-body camera distance (Mpc) at which a
 * `.mesh` asset is demanded. `LOAD_RADIUS_BODY_RADII` sits one order above
 * the planets' `1e4`: at `1e4` a ~10 m body like the whale demands inside
 * 100 km, past the 3 px partition boundary, while `1e5` puts the edge at
 * ~1000 km, well outside the handoff.
 */

import { SCENE_MESH_BODIES } from '../../../data/bodies/sceneMeshBodies';
import { findByIdOrThrow } from '../../../utils/object/findByIdOrThrow';
import { SCALE_UNITS } from '../../../data/scaleUnits';

const LOAD_RADIUS_BODY_RADII = 1e5;

export function loadRadiusMpc(id: string): number {
  const body = findByIdOrThrow(SCENE_MESH_BODIES, id, 'meshBodyLoadRadius');
  return body.radiusM * SCALE_UNITS.M_TO_MPC * LOAD_RADIUS_BODY_RADII;
}
