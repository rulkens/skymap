/**
 * drawMeshBodiesOnRow — the given bodies as lit triangle meshes in metres, on the row's host.
 * A mesh body with a slab-owning host owns NO row of its own: it rides the host's body-m row
 * the way `ringsPass` rides Saturn's. One that owns a row, or hangs off something rowless,
 * hosts itself; `meshBodySlabHostId` decides. Shared by every mesh pass, whichever Layer's.
 *
 * FRAME CONTRACT (`shaders/bodies/meshBody/io.wesl`): every direction the shader receives is in
 * the HOST's fixed axes, the frame `posM`/`rotM` land in, so `sunDirLocal` is fed the HOST's
 * orientation, not the body's own.
 */

import type { PassState } from '../../../@types/engine/frame/PassState';
import type { FrameView } from '../../../@types/engine/frame/FrameView';
import type { SlabView } from '../../../@types/engine/frame/SlabView';
import type { MeshPresentation } from '../../../@types/scene/MeshPresentation';
import { RENDER_ORIGIN_MPC } from '../../../data/renderOrigin';
import { SCALE_UNITS } from '../../../data/scaleUnits';
import { SCENE_CELESTIAL_BODIES } from '../../../data/bodies/sceneCelestialBodies';
import { SOLAR_RADIUS_KM } from '../../../data/bodies/solarRadiusKm';
import { composeMeshMvp } from '../../../utils/camera/composeMeshMvp';
import { sunDirLocal } from '../../../utils/camera/sunDirLocal';
import { narrowMat4 } from '../../../utils/math/narrowMat4';
import { packMeshBodyUniforms } from '../../../utils/gpu/packMeshBodyUniforms';
import { bodyStateInHostFrame } from '../../../utils/scene/bodyStateInHostFrame';
import { innerBoundRadiusM } from '../../../utils/occlusion/innerBoundRadiusM';
import { sinSunAngularRadius } from '../../../utils/occlusion/sinSunAngularRadius';
import { sunVisibleFraction } from '../../../utils/occlusion/sunVisibleFraction';
import { sceneBodyStates } from './sceneBodyStates';
import type { PositionedId } from '../../../@types/scene/PositionedId';

export function drawMeshBodiesOnRow(
  pass: GPURenderPassEncoder,
  view: SlabView,
  ctx: FrameView,
  state: PassState,
  bodies: readonly MeshPresentation[],
): void {
  const renderer = state.gpu.meshBodyRenderer;
  if (renderer === null || view.slab.frame.kind !== 'body-m' || bodies.length === 0) return;
  const hostId = view.slab.frame.hostId;
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
        ambient: state.settings.debug.meshAmbient,
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
}
