/**
 * meshBodiesPass — the `meshes` branch of the per-frame body partition, as lit
 * triangle meshes in metres. A mesh body with a slab-owning host owns NO row of
 * its own: it rides the host's body-m row the way `ringsPass` rides Saturn's.
 * One hanging off something rowless (the Sun, or nothing) hosts itself —
 * `meshBodySlabHostId` decides, and `BODY_SLAB_CAPACITY` counts those.
 *
 * FRAME CONTRACT (`shaders/bodies/meshBody/io.wesl`): every direction the
 * shader receives is in the HOST's fixed axes — the frame `posM`/`rotM` land
 * in — so `sunDirLocal` is fed the HOST's orientation, not the body's own.
 */

import type { ContentPass } from '../../../../@types/engine/frame/ContentPass';
import type { Vec3 } from '../../../../@types/math/Vec3';
import { RENDER_ORIGIN_MPC } from '../../../../data/renderOrigin';
import { SCALE_UNITS } from '../../../../data/scaleUnits';
import { Source } from '../../../../data/sources';
import { packSelection, PICK_SENTINEL_OFFSET } from '../../../../data/selectionEncoding';
import { ATMOSPHERE_PARAMS } from '../../../../data/bodies/atmosphereParams';
import { EARTH_SURFACE_PARAMS } from '../../../../data/bodies/earthSurfaceParams';
import { SCENE_BODIES } from '../../../../data/bodies/sceneBodies';
import { SCENE_MESH_BODIES } from '../../../../data/bodies/sceneMeshBodies';
import { SOLAR_RADIUS_KM } from '../../../../data/bodies/solarRadiusKm';
import { composeMeshMvp } from '../../../../utils/camera/composeMeshMvp';
import { sunDirLocal } from '../../../../utils/camera/sunDirLocal';
import { narrowMat4 } from '../../../../utils/math/narrowMat4';
import { packMeshBodyUniforms } from '../../../../utils/gpu/packMeshBodyUniforms';
import { bodyStateInHostFrame } from '../../../../utils/scene/bodyStateInHostFrame';
import { hostSkyFraction } from '../../../../utils/scene/hostSkyFraction';
import { sunVisibleFraction } from '../../../../utils/scene/sunVisibleFraction';
import { bodySlabFlooredPick } from '../../helpers/bodySlabFlooredPick';
import { drawableMeshBodies } from '../drawableMeshBodies';
import { sceneBodyStates } from '../sceneBodyStates';
import { seedIndexOfBody } from './seedIndexOfBody';

export const meshBodiesPass: ContentPass = {
  name: 'mesh-bodies',
  slab: 'body',
  target: 'foreground:0',
  blend: 'opaque',

  enabled(state, ctx, view) {
    if (view.slab.frame.kind !== 'body-m') return false;
    return drawableMeshBodies(state, ctx, view.slab.frame.bodyId).length > 0;
  },

  draw(pass, view, ctx, state) {
    const renderer = state.gpu.meshBodyRenderer;
    if (renderer === null || view.slab.frame.kind !== 'body-m') return;
    const hostId = view.slab.frame.bodyId;
    const bodies = drawableMeshBodies(state, ctx, hostId);
    if (bodies.length === 0) return;
    const bodyStates = sceneBodyStates(state, ctx);
    const hostState = bodyStates.get(hostId);
    // Radius for the umbra geometry: the seed registry, the same home
    // `bodyHomePose` and `bodyTextureLoadRadius` read it from.
    const host = SCENE_BODIES.find((body) => body.id === hostId);
    if (hostState === undefined || host === undefined) return;
    // The SAME pose-provider closure `deriveSlabs` built this row's
    // `view.slab.vp` from — read, never re-derived.
    const hostPose = ctx.bodyPose(hostId);
    if (hostPose === null) return;
    // A host with no `ATMOSPHERE_PARAMS` row has no authored ground albedo, so
    // it contributes no fill rather than an invented one.
    const hostShineColor: Vec3 = ATMOSPHERE_PARAMS[hostId]?.groundAlbedo ?? [0, 0, 0];

    for (const body of bodies) {
      const bodyState = bodyStates.get(body.id)!;
      const { posM, rotM } = bodyStateInHostFrame(bodyState, hostState);
      const distToHostM = Math.hypot(posM[0], posM[1], posM[2]);
      const invDist = distToHostM > 0 ? 1 / distToHostM : 0;
      // A hostless body is its own host, so both host-lighting terms degenerate
      // at zero separation: `sunVisibleFraction` returns NaN and
      // `hostSkyFraction` a half-sky. Unshadowed Sun, no fill, instead.
      const hosted = body.id !== hostId;
      renderer.draw(
        pass,
        body.id,
        packMeshBodyUniforms({
          // Narrow here, at the uniform write — the compose above is f64.
          mvp: narrowMat4(composeMeshMvp(view.slab.vp, posM, hostPose.eyeRelBodyM, rotM)),
          sunDirLocal: sunDirLocal(bodyState.positionMpc, RENDER_ORIGIN_MPC, hostState.orientation),
          sunVisibleFraction: hosted
            ? sunVisibleFraction({
                bodyPosMpc: bodyState.positionMpc,
                sunPosMpc: RENDER_ORIGIN_MPC,
                hostPosMpc: hostState.positionMpc,
                sunRadiusM: SOLAR_RADIUS_KM * SCALE_UNITS.KM_TO_M,
                hostRadiusM: host.radiusM,
              })
            : 1,
          model: rotM,
          camPosLocal: [
            hostPose.eyeRelBodyM[0] - posM[0],
            hostPose.eyeRelBodyM[1] - posM[1],
            hostPose.eyeRelBodyM[2] - posM[2],
          ],
          // Sunlight off the host's ground (`hostShineColor` is its albedo),
          // over the share of this body's sky the host actually fills, over the
          // Lambert π that this fill term — unlike `pbrDirect` — does not carry.
          // `sunIrradiance` is the fragment's own `SUN_IRRADIANCE`, mirrored
          // there under the parity test in `shaders/constants.parity.test.ts`.
          hostShineStrength: hosted
            ? (EARTH_SURFACE_PARAMS.sunIrradiance / Math.PI) *
              hostSkyFraction(host.radiusM, distToHostM)
            : 0,
          hostShineColor,
          dirToHost: [-posM[0] * invDist, -posM[1] * invDist, -posM[2] * invDist],
        }),
      );
    }
  },

  /**
   * Pick set = draw set, so no `pickEnabled` override. The proxy sphere sits at
   * the mesh body's own centre while riding the host's row — that is what the
   * `eyeRelBodyM − posM` argument encodes. No −1 seed-index guard: `bodies`
   * came out of `SCENE_MESH_BODIES.filter`, so every id is in that table.
   */
  drawPick(pass, view, ctx, state) {
    const pickRenderer = state.gpu.bodyPickRenderer;
    if (pickRenderer === null || view.slab.frame.kind !== 'body-m') return;
    const hostId = view.slab.frame.bodyId;
    const bodies = drawableMeshBodies(state, ctx, hostId);
    if (bodies.length === 0) return;
    const bodyStates = sceneBodyStates(state, ctx);
    const hostState = bodyStates.get(hostId);
    if (hostState === undefined) return;
    const hostPose = ctx.bodyPose(hostId);
    if (hostPose === null) return;

    for (const body of bodies) {
      const { posM } = bodyStateInHostFrame(bodyStates.get(body.id)!, hostState);
      const { mvp, camPosLocal } = bodySlabFlooredPick(
        view.slab.vp,
        [
          hostPose.eyeRelBodyM[0] - posM[0],
          hostPose.eyeRelBodyM[1] - posM[1],
          hostPose.eyeRelBodyM[2] - posM[2],
        ],
        body.radiusM,
        ctx.drawPxPerRad,
      );
      pickRenderer.drawSphere(pass, {
        mvp,
        camPosLocal,
        packedId: packSelection(
          Source.MeshBody,
          seedIndexOfBody(body.id, SCENE_MESH_BODIES) + PICK_SENTINEL_OFFSET,
        ),
      });
    }
  },
};
