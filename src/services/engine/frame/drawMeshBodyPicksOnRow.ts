/**
 * drawMeshBodyPicksOnRow — the given bodies' pick proxy spheres on the row's host. Pick set =
 * draw set minus `anchored` sites: an anchored mesh is ground (a park scan), and its ~160 m
 * proxy sphere would swallow every click on the terrain around it. The proxy sits at the mesh
 * body's own centre while riding the host's row, which the `eyeRelBodyM − posM` argument
 * encodes. `pickIdOf` returns null for a body that must not pick.
 */

import type { PassState } from '../../../@types/engine/frame/PassState';
import type { FrameView } from '../../../@types/engine/frame/FrameView';
import type { SlabView } from '../../../@types/engine/frame/SlabView';
import type { MeshPresentation } from '../../../@types/scene/MeshPresentation';
import { ANCHORED_MESH_BODY_IDS } from '../../../data/bodies/anchoredMeshBodyIds';
import { bodyStateInHostFrame } from '../../../utils/scene/bodyStateInHostFrame';
import { bodySlabFlooredPick } from '../helpers/bodySlabFlooredPick';
import { sceneBodyStates } from './sceneBodyStates';
import type { SceneBodyId } from '../../../@types/scene/SceneBodyId';

export function drawMeshBodyPicksOnRow(
  pass: GPURenderPassEncoder,
  view: SlabView,
  ctx: FrameView,
  state: PassState,
  bodies: readonly MeshPresentation[],
  pickIdOf: (bodyId: SceneBodyId) => number | null,
): void {
  const pickRenderer = state.gpu.bodyPickRenderer;
  if (pickRenderer === null || view.slab.frame.kind !== 'body-m' || bodies.length === 0) return;
  const hostId = view.slab.frame.hostId;
  const bodyStates = sceneBodyStates(state, ctx);
  const hostState = bodyStates.get(hostId);
  if (hostState === undefined) return;
  const hostPose = ctx.bodyPose(hostId);
  if (hostPose === null) return;

  for (const body of bodies) {
    const packedId = pickIdOf(body.id);
    if (ANCHORED_MESH_BODY_IDS.has(body.id) || packedId === null) continue;
    const { posM } = bodyStateInHostFrame(bodyStates.get(body.id)!, hostState);
    const { mvp, camPosLocal } = bodySlabFlooredPick(
      view.slab.vp,
      [
        hostPose.eyeRelBodyM[0] - posM[0],
        hostPose.eyeRelBodyM[1] - posM[1],
        hostPose.eyeRelBodyM[2] - posM[2],
      ],
      body.boundingRadiusM,
      ctx.drawPxPerRad,
    );
    pickRenderer.drawSphere(pass, { mvp, camPosLocal, packedId });
  }
}
