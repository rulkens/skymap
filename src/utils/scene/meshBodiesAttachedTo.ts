/**
 * meshBodiesAttachedTo — every `SCENE_MESH_BODIES` row riding `hostId`'s slab,
 * keyed by the body's own position driver (`meshBodySlabHostId`) and never a
 * second copy on `MeshBody`, which could drift from the orbit it rides. A
 * hostless body keys on itself, so it is "attached to" its own row.
 */

import type { MeshBody } from '../../@types/scene/MeshBody';
import { SCENE_MESH_BODIES } from '../../data/bodies/sceneMeshBodies';
import { meshBodySlabHostId } from './meshBodySlabHostId';

// Both inputs are static, so the join runs once here rather than per body-slab
// row per frame (`enabled`, `draw`, `drawPick` each ask).
const BY_HOST_ID = SCENE_MESH_BODIES.reduce<Map<string, MeshBody[]>>((acc, body) => {
  const hostId = meshBodySlabHostId(body);
  const bodies = acc.get(hostId);
  if (bodies === undefined) acc.set(hostId, [body]);
  else bodies.push(body);
  return acc;
}, new Map());

const NONE: readonly MeshBody[] = [];

export function meshBodiesAttachedTo(hostId: string): readonly MeshBody[] {
  return BY_HOST_ID.get(hostId) ?? NONE;
}
