/**
 * meshBodiesAttachedTo — every `SCENE_MESH_BODIES` row riding `hostId`'s slab,
 * keyed by the body's own orbital row (`elementsById(id).focusId`) and never a
 * second copy on `MeshBody`, which could drift from the orbit it rides.
 */

import type { MeshBody } from '../../@types/scene/MeshBody';
import { SCENE_MESH_BODIES } from '../../data/bodies/sceneMeshBodies';
import { elementsById } from '../../data/bodies/orbitalElements';

// Both inputs are static, so the join runs once here rather than per body-slab
// row per frame (`enabled`, `draw`, `drawPick` each ask).
const BY_HOST_ID = SCENE_MESH_BODIES.reduce<Map<string, MeshBody[]>>((acc, body) => {
  const hostId = elementsById(body.id).focusId;
  const bodies = acc.get(hostId);
  if (bodies === undefined) acc.set(hostId, [body]);
  else bodies.push(body);
  return acc;
}, new Map());

const NONE: readonly MeshBody[] = [];

export function meshBodiesAttachedTo(hostId: string): readonly MeshBody[] {
  return BY_HOST_ID.get(hostId) ?? NONE;
}
