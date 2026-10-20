/**
 * drawableMeshBodies — the mesh-drawn bodies a host row draws: attached to it
 * and in the partition's `meshes` (resolved AND resident). ONE derivation behind
 * `meshBodiesPass`'s `enabled`, `draw` and `drawPick`, so the gate and the two
 * draws cannot disagree. A host with nothing attached short-circuits before
 * `sceneBodyPartition` is touched.
 */

import type { PassState } from '../../../@types/engine/frame/PassState';
import type { FrameView } from '../../../@types/engine/frame/FrameView';
import type { MeshPresentation } from '../../../@types/scene/MeshPresentation';
import { meshBodiesAttachedTo } from '../../../utils/meshBodies/meshBodiesAttachedTo';
import { sceneBodyPartition } from './sceneBodyPartition';

export function drawableMeshBodies(
  state: PassState,
  ctx: FrameView,
  hostId: string,
): readonly MeshPresentation[] {
  if (state.gpu.meshBodyRenderer === null) return [];
  const attached = meshBodiesAttachedTo(hostId);
  if (attached.length === 0) return [];
  const resolved = sceneBodyPartition(state, ctx).meshes;
  return attached.filter((body) => resolved.some((m) => m.id === body.id));
}
