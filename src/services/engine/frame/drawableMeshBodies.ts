/**
 * drawableMeshBodies — the mesh bodies a host row draws: attached to it, past
 * the partition's glint threshold, AND resident. ONE derivation behind
 * `meshBodiesPass`'s `enabled`, `draw` and `drawPick`, so the gate and the two
 * draws cannot disagree. An empty `SCENE_MESH_BODIES` short-circuits before
 * `sceneBodyPartition` is touched.
 *
 * Residency is the demand-driven gate: a body inside the load radius but not
 * yet decoded draws nothing — invisible rather than a wrong shape (spec).
 */

import type { PassState } from '../../../@types/engine/frame/PassState';
import type { ReadyFrameContext } from '../../../@types/engine/frame/ReadyFrameContext';
import type { MeshBody } from '../../../@types/scene/MeshBody';
import { meshBodiesAttachedTo } from '../../../utils/scene/meshBodiesAttachedTo';
import { sceneBodyPartition } from './sceneBodyPartition';

export function drawableMeshBodies(
  state: PassState,
  ctx: ReadyFrameContext,
  hostId: string,
): readonly MeshBody[] {
  const renderer = state.gpu.meshBodyRenderer;
  if (renderer === null) return [];
  const attached = meshBodiesAttachedTo(hostId);
  if (attached.length === 0) return [];
  const resolved = sceneBodyPartition(state, ctx).meshes;
  return attached.filter(
    (body) => resolved.some((m) => m.id === body.id) && renderer.hasMesh(body.id),
  );
}
