/**
 * meshBodyLoadRadius — the per-mesh-body camera distance (Mpc) at which a
 * `.mesh` asset is demanded: 1e5 BODY RADII, one order above the planets'
 * 1e4. At 1e4 a ~10 m body like the whale would demand inside 100 km, past
 * the 3 px partition boundary; 1e5 puts the edge at ~1000 km, well outside
 * the handoff.
 */

import { SCENE_MESH_BODIES } from '../../../data/bodies/sceneMeshBodies';
import { findByIdOrThrow } from '../../../utils/object/findByIdOrThrow';
import { SCALE_UNITS } from '../../../data/scaleUnits';

export function loadRadiusMpc(id: string): number {
  const body = findByIdOrThrow(SCENE_MESH_BODIES, id, 'meshBodyLoadRadius');
  return body.boundingRadiusM * SCALE_UNITS.M_TO_MPC * 1e5;
}
