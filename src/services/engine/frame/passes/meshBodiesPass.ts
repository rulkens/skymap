/**
 * meshBodiesPass — the `meshes` branch of the per-frame body partition, as lit
 * triangle meshes in metres. A mesh body with a slab-owning host owns NO row of
 * its own: it rides the host's body-m row the way `ringsPass` rides Saturn's.
 * One that owns a row, or hangs off something rowless, hosts itself —
 * `meshBodySlabHostId` decides, and `SLAB_ROW_CEILING` counts the rowless ones.
 *
 * FRAME CONTRACT (`shaders/bodies/meshBody/io.wesl`): every direction the
 * shader receives is in the HOST's fixed axes — the frame `posM`/`rotM` land
 * in — so `sunDirLocal` is fed the HOST's orientation, not the body's own.
 */

import type { ContentPass } from '../../../../@types/engine/frame/ContentPass';
import { RENDER_ORIGIN_MPC } from '../../../../data/renderOrigin';
import { SCALE_UNITS } from '../../../../data/scaleUnits';
import { sceneBodyPickId } from '../../../../utils/picking/sceneBodyPickId';
import { SCENE_CELESTIAL_BODIES } from '../../../../data/bodies/sceneCelestialBodies';
import { ANCHORED_MESH_BODY_IDS } from '../../../../data/bodies/anchoredMeshBodyIds';
import { SOLAR_RADIUS_KM } from '../../../../data/bodies/solarRadiusKm';
import { composeMeshMvp } from '../../../../utils/camera/composeMeshMvp';
import { sunDirLocal } from '../../../../utils/camera/sunDirLocal';
import { narrowMat4 } from '../../../../utils/math/narrowMat4';
import { packMeshBodyUniforms } from '../../../../utils/gpu/packMeshBodyUniforms';
import { bodyStateInHostFrame } from '../../../../utils/scene/bodyStateInHostFrame';
import { innerBoundRadiusM } from '../../../../utils/occlusion/innerBoundRadiusM';
import { sinSunAngularRadius } from '../../../../utils/occlusion/sinSunAngularRadius';
import { sunVisibleFraction } from '../../../../utils/occlusion/sunVisibleFraction';
import { bodySlabFlooredPick } from '../../helpers/bodySlabFlooredPick';
import { drawableMeshBodies } from '../drawableMeshBodies';
import { sceneBodyStates } from '../sceneBodyStates';

export const meshBodiesPass: ContentPass = {
  name: 'mesh-bodies',

  enabled(state, ctx, view) {
    if (view.slab.frame.kind !== 'body-m') return false;
    return drawableMeshBodies(state, ctx, view.slab.frame.hostId).length > 0;
  },

  draw(pass, view, ctx, state) {
    const renderer = state.gpu.meshBodyRenderer;
    if (renderer === null || view.slab.frame.kind !== 'body-m') return;
    const hostId = view.slab.frame.hostId;
    const bodies = drawableMeshBodies(state, ctx, hostId);
    if (bodies.length === 0) return;
    const bodyStates = sceneBodyStates(state, ctx);
    const hostState = bodyStates.get(hostId);
    // The umbra is ground geometry, so the host comes from the CELESTIAL roster;
    // a hostless body misses (see below).
    const host = SCENE_CELESTIAL_BODIES.find((body) => body.id === hostId);
    if (hostState === undefined) return;
    // The SAME pose-provider closure `deriveSlabs` built this row's
    // `view.slab.vp` from — read, never re-derived.
    const hostPose = ctx.bodyPose(hostId);
    if (hostPose === null) return;
    const sunRadiusM = SOLAR_RADIUS_KM * SCALE_UNITS.KM_TO_M;

    for (const body of bodies) {
      const bodyState = bodyStates.get(body.id)!;
      const { posM, rotM } = bodyStateInHostFrame(bodyState, hostState);
      // A self-hosted body casts no host shadow on itself, and `sunVisibleFraction`
      // returns NaN at zero separation. Unshadowed Sun instead.
      const umbraHost = hostId === body.id ? undefined : host;
      renderer.draw(
        pass,
        body.id,
        packMeshBodyUniforms({
          // Narrow here, at the uniform write — the compose above is f64.
          mvp: narrowMat4(composeMeshMvp(view.slab.vp, posM, hostPose.eyeRelBodyM, rotM)),
          sunDirLocal: sunDirLocal(bodyState.positionMpc, RENDER_ORIGIN_MPC, hostState.orientation),
          sunVisibleFraction: umbraHost
            ? sunVisibleFraction({
                bodyPosMpc: bodyState.positionMpc,
                sunPosMpc: RENDER_ORIGIN_MPC,
                hostPosMpc: hostState.positionMpc,
                sunRadiusM,
                hostRadiusM: innerBoundRadiusM(umbraHost.surface),
              })
            : 1,
          model: rotM,
          camPosLocal: [
            hostPose.eyeRelBodyM[0] - posM[0],
            hostPose.eyeRelBodyM[1] - posM[1],
            hostPose.eyeRelBodyM[2] - posM[2],
          ],
          sinSunAngularRadius: sinSunAngularRadius(
            bodyState.positionMpc,
            RENDER_ORIGIN_MPC,
            sunRadiusM,
          ),
        }),
      );
    }
  },

  /**
   * Pick set = draw set minus `anchored` sites, so no `pickEnabled` override:
   * an anchored mesh is ground (a park scan), and its ~160 m proxy sphere
   * would swallow every click on the terrain around it. The proxy sphere sits
   * at the mesh body's own centre while riding the host's row — that is what
   * the `eyeRelBodyM − posM` argument encodes. `sceneBodyPickId` packs the
   * body's OWN table, so a moon drawn as a mesh picks as a moon.
   */
  drawPick(pass, view, ctx, state) {
    const pickRenderer = state.gpu.bodyPickRenderer;
    if (pickRenderer === null || view.slab.frame.kind !== 'body-m') return;
    const hostId = view.slab.frame.hostId;
    const bodies = drawableMeshBodies(state, ctx, hostId);
    if (bodies.length === 0) return;
    const bodyStates = sceneBodyStates(state, ctx);
    const hostState = bodyStates.get(hostId);
    if (hostState === undefined) return;
    const hostPose = ctx.bodyPose(hostId);
    if (hostPose === null) return;

    for (const body of bodies) {
      const packedId = sceneBodyPickId(body.id);
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
      pickRenderer.drawSphere(pass, {
        mvp,
        camPosLocal,
        packedId,
      });
    }
  },
};
