/**
 * meshBodyLoadRadius — the per-mesh-body camera distance (Mpc) at which a
 * `.mesh` asset is demanded. Mirrors `bodyTextureLoadRadius.ts`'s
 * `radiusM * M_TO_MPC * MULTIPLIER` shape, but simpler: a mesh body's id IS
 * its own `SCENE_MESH_BODIES` row (no ring-style host indirection).
 *
 * `LOAD_RADIUS_BODY_RADII` sits one order above the planets' `1e4`
 * (`bodyTextureLoadRadius.ts:60`) — at `1e4`, a ~10 m body like the whale
 * demands inside 100 km, past the 3 px partition boundary; `1e5` puts the
 * edge at ~1000 km. Tune at the Task 18 visual pass if the handoff pops.
 */

import { SCENE_MESH_BODIES } from '../../../data/bodies/sceneMeshBodies';
import { findByIdOrThrow } from '../../../utils/object/findByIdOrThrow';
import { SCALE_UNITS } from '../../../data/scaleUnits';

const LOAD_RADIUS_BODY_RADII = 1e5;

export function loadRadiusMpc(id: string): number {
  const body = findByIdOrThrow(SCENE_MESH_BODIES, id, 'meshBodyLoadRadius');
  return body.radiusM * SCALE_UNITS.M_TO_MPC * LOAD_RADIUS_BODY_RADII;
}
