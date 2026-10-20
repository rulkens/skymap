/**
 * meshBodiesAttachedTo — every `MESH_PRESENTATIONS` row riding `hostId`'s slab,
 * keyed by the body's own position driver (`meshBodySlabHostId`) and never a
 * second copy on the row, which could drift from the orbit it rides. A
 * hostless body keys on itself, so it is "attached to" its own row.
 */

import type { MeshPresentation } from '../../@types/scene/MeshPresentation';
import { MESH_PRESENTATIONS } from '../../data/bodies/meshPresentations';
import { meshBodySlabHostId } from './meshBodySlabHostId';

// Both inputs are static, so the join runs once here rather than per body-slab
// row per frame (`enabled`, `draw`, `drawPick` each ask).
const BY_HOST_ID = MESH_PRESENTATIONS.reduce<Map<string, MeshPresentation[]>>((acc, body) => {
  const hostId = meshBodySlabHostId(body.id);
  const bodies = acc.get(hostId);
  if (bodies === undefined) acc.set(hostId, [body]);
  else bodies.push(body);
  return acc;
}, new Map());

const NONE: readonly MeshPresentation[] = [];

export function meshBodiesAttachedTo(hostId: string): readonly MeshPresentation[] {
  return BY_HOST_ID.get(hostId) ?? NONE;
}
