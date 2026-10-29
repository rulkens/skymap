/**
 * drawableMeshBodies — the mesh-drawn bodies of `roster` a host row draws: attached to it
 * and in that roster's partition `meshes` (resolved AND resident). ONE derivation behind a
 * mesh pass's `enabled`, `draw` and `drawPick`, so the gate and the two draws cannot
 * disagree. A host with none of the roster attached short-circuits before
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
  roster: ReadonlySet<string>,
): readonly MeshPresentation[] {
  if (state.gpu.meshBodyRenderer === null) return [];
  const attached = meshBodiesAttachedTo(hostId).filter((body) => roster.has(body.id));
  if (attached.length === 0) return [];
  // Surface maps only split `flat` from `textured`; `meshes` never reads them.
  const resolved = sceneBodyPartition(state, ctx, roster, () => false).meshes;
  return attached.filter((body) => resolved.some((m) => m.id === body.id));
}
