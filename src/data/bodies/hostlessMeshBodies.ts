/**
 * HOSTLESS_MESH_BODIES — the mesh bodies that own a `body-m` row rather than
 * riding a host's, and so count towards `BODY_SLAB_CAPACITY`. Derived from
 * `meshBodySlabHostId`, never authored, so a new seed lands its row by existing.
 */

import type { MeshBody } from '../../@types/scene/MeshBody';
import { meshBodySlabHostId } from '../../utils/scene/meshBodySlabHostId';
import { SCENE_MESH_BODIES } from './sceneMeshBodies';

export const HOSTLESS_MESH_BODIES: readonly MeshBody[] = SCENE_MESH_BODIES.filter(
  (body) => meshBodySlabHostId(body) === body.id,
);
