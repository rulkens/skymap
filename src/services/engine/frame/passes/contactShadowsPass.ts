/**
 * contactShadowsPass — each seated mesh body's baked contact shadow, projected
 * as a box decal onto whatever the row's depth holds (the terrain). Runs in the
 * body row's depth-SAMPLING step: it reads `foreground:0`'s depth, so that
 * depth is bound as a texture, never attached. Poses as in `meshBodiesPass`.
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

  // A row with a decal and a resident mesh has its texture too: the fetcher
  // loads the mask in the same batch as the mesh.
  enabled(state, ctx, view) {
    if (view.slab.frame.kind !== 'body-m') return false;
    return drawableMeshBodies(state, ctx, view.slab.frame.bodyId).some(
      (body) => MESH_ASSETS[body.meshKey]?.contactDecal !== undefined,
    );
  },

  draw(pass, view, ctx, state) {
    const renderer = state.gpu.meshBodyRenderer;
    if (renderer === null || view.slab.frame.kind !== 'body-m') return;
    const hostId = view.slab.frame.bodyId;
    const bodyStates = sceneBodyStates(state, ctx);
    const hostState = bodyStates.get(hostId);
    if (hostState === undefined) return;
    const hostPose = ctx.bodyPose(hostId);
    if (hostPose === null) return;
    const depthView = ctx.snapshot.renderTargets.depthViewOf('foreground:0');

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
