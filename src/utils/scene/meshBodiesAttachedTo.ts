/**
 * meshBodiesAttachedTo — every `SCENE_MESH_BODIES` row riding `hostId`'s
 * slab, keyed by the mesh body's own orbital row (`elementsById(id).focusId`)
 * — never a second copy on `MeshBody` itself, so it can't drift from the
 * orbit the body actually rides.
 */

import type { MeshBody } from '../../@types/scene/MeshBody';
import { SCENE_MESH_BODIES } from '../../data/bodies/sceneMeshBodies';
import { elementsById } from '../../data/bodies/orbitalElements';

export function meshBodiesAttachedTo(hostId: string): readonly MeshBody[] {
  return SCENE_MESH_BODIES.filter((body) => elementsById(body.id).focusId === hostId);
}
