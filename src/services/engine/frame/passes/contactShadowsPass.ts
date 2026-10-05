/**
 * contactShadowsPass — each seated mesh body's baked contact shadow, projected
 * as a box decal onto whatever the row's depth holds (the terrain). It reads
 * the depth its step declared (`view.sampledDepth`), and only when its OWN row
 * wrote it — a `{ sample }` step's passes never see a stranger's terrain.
 * Poses as in `meshBodiesPass`.
 */

import type { ContentPass } from '../../../../@types/engine/frame/ContentPass';
import { MESH_ASSETS } from '../../../../data/bodies/meshAssets.generated';
import { composeContactDecalMatrices } from '../../../../utils/camera/composeContactDecalMatrices';
import { narrowMat4 } from '../../../../utils/math/narrowMat4';
import { packContactShadowUniforms } from '../../../../utils/gpu/packContactShadowUniforms';
import { bodyStateInHostFrame } from '../../../../utils/scene/bodyStateInHostFrame';
import { drawableMeshBodies } from '../drawableMeshBodies';
import { sceneBodyStates } from '../sceneBodyStates';

export const contactShadowsPass: ContentPass = {
  name: 'contact-shadows',

  // Gates on the step's own row before the mesh scan: a `{ sample }` step
  // that runs before anything has cleared its source, or that samples a
  // DIFFERENT row than the one it draws, must not project onto stale or
  // unrelated depth.
  enabled(state, ctx, view) {
    if (view.sampledDepth?.row !== view.slab) return false;
    if (view.slab.frame.kind !== 'body-m') return false;
    return drawableMeshBodies(state, ctx, view.slab.frame.hostId).some(
      (body) => MESH_ASSETS[body.meshKey]?.contactDecal !== undefined,
    );
  },

  draw(pass, view, ctx, state) {
    const renderer = state.gpu.meshBodyRenderer;
    if (renderer === null || view.slab.frame.kind !== 'body-m') return;
    const hostId = view.slab.frame.hostId;
    const bodyStates = sceneBodyStates(state, ctx);
    const hostState = bodyStates.get(hostId);
    if (hostState === undefined) return;
    const hostPose = ctx.bodyPose(hostId);
    if (hostPose === null) return;
    const depthView = view.sampledDepth!.view;

    for (const body of drawableMeshBodies(state, ctx, hostId)) {
      const decal = MESH_ASSETS[body.meshKey]?.contactDecal;
      if (decal === undefined) continue;
      const { posM, rotM } = bodyStateInHostFrame(bodyStates.get(body.id)!, hostState);
      const { boxToClip, clipToBox } = composeContactDecalMatrices(
        view.slab.vp,
        posM,
        hostPose.eyeRelBodyM,
        rotM,
        decal,
      );
      renderer.drawContactShadow(
        pass,
        body.id,
        packContactShadowUniforms(narrowMat4(boxToClip), narrowMat4(clipToBox)),
        depthView,
      );
    }
  },
};
