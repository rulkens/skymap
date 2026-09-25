import type { MeshBody } from './MeshBody';
import type { MeshHoleRect } from '../data/mesh/MeshHoleRect';

/** A mesh body that cuts its host's terrain, joined once with the lat/lon
 *  rect its `MESH_ASSETS` row's mask covers. */
export type HoledMeshBody = {
  readonly body: MeshBody;
  readonly rect: MeshHoleRect;
};
