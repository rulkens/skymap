/**
 * meshShadowsCompute — core's `mesh-shadows` row: every resident mesh body's pose on its slab
 * host, handed to `meshBodyRenderer.renderShadows`, which redraws only the stale layers. Poses
 * come from the helpers `drawMeshBodiesOnRow` uses, so a layer and the draw that reads it agree.
 * Once per frame, ahead of SCENE: a shadow depends on the sun, never on the view.
 */

import type { ContentCompute } from '../../../../@types/engine/frame/ContentCompute';
import type { MeshShadowCaster } from '../../../../@types/rendering/MeshShadowCaster';
import { MESH_PRESENTATIONS } from '../../../../data/bodies/meshPresentations';
import { positionDriverOrNull } from '../../../../data/bodies/positionDrivers';
import { RENDER_ORIGIN_MPC } from '../../../../data/renderOrigin';
import { meshBodySlabHostId } from '../../../../utils/meshBodies/meshBodySlabHostId';
import { bodyStateInHostFrame } from '../../../../utils/scene/bodyStateInHostFrame';
import { sunDirLocal } from '../../../../utils/camera/bodyCompose/sunDirLocal';
import { rotateByTranspose } from '../../../../utils/math/rotateByTranspose';
import { sceneBodyStates } from '../sceneBodyStates';

export const meshShadowsCompute: ContentCompute = {
  name: 'mesh-shadows',
  scope: 'once',
  encode(encoder, ctx, state, claimTimestampWrites) {
    const renderer = state.gpu.meshBodyRenderer;
    if (renderer === null || state.settings.debug.overlays['mesh-no-shadows']) return;
    const bodyStates = sceneBodyStates(state, ctx);
    const casters: MeshShadowCaster[] = [];
    for (const { id } of MESH_PRESENTATIONS) {
      if (!renderer.hasMesh(id)) continue;
      const hostId = meshBodySlabHostId(id);
      const bodyState = bodyStates.get(id);
      const hostState = bodyStates.get(hostId);
      if (bodyState === undefined || hostState === undefined) continue;
      const { posM, rotM } = bodyStateInHostFrame(bodyState, hostState);
      const sunHost = sunDirLocal(bodyState.positionMpc, RENDER_ORIGIN_MPC, hostState.orientation);
      const driver = positionDriverOrNull(id);
      const [x, y, z] = bodyState.positionMpc;
      const [cx, cy, cz] = ctx.drawCamPos;
      casters.push({
        id,
        posM,
        rotM,
        sunDirMesh: rotateByTranspose(rotM, sunHost),
        cameraDistanceSq: (x - cx) ** 2 + (y - cy) ** 2 + (z - cz) ** 2,
        // The PR 1 gate: a site standing on the row's host.
        groundHostId: driver?.kind === 'surfaceFixed' && driver.hostId === hostId ? hostId : null,
      });
    }
    renderer.renderShadows(encoder, casters, claimTimestampWrites);
  },
};
