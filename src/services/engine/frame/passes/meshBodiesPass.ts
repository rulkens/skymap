/**
 * meshBodiesPass — the `meshes` branch of the per-frame body partition, as lit
 * triangle meshes in metres. A mesh body owns NO slab row: it rides its HOST's
 * body-m row the way `ringsPass` rides Saturn's, so `slabBodyCandidates` and
 * `BODY_SLAB_CAPACITY` stay untouched.
 *
 * FRAME CONTRACT (`shaders/bodies/meshBody/io.wesl`): every direction the
 * shader receives is in the HOST's fixed axes — the frame `posM`/`rotM` land
 * in — so `sunDirLocal` is fed the HOST's orientation, not the body's own.
 */

import type { ContentPass } from '../../../../@types/engine/frame/ContentPass';
import type { EngineState } from '../../../../@types/engine/state/EngineState';
import type { ReadyFrameContext } from '../../../../@types/engine/frame/ReadyFrameContext';
import type { MeshBody } from '../../../../@types/scene/MeshBody';
import type { Mat3 } from '../../../../@types/math/Mat3';
import type { Vec3 } from '../../../../@types/math/Vec3';
import { mat4d } from 'wgpu-matrix';
import { RENDER_ORIGIN_MPC } from '../../../../data/renderOrigin';
import { SCALE_UNITS } from '../../../../data/scaleUnits';
import { Source } from '../../../../data/sources';
import { packSelection, PICK_SENTINEL_OFFSET } from '../../../../data/selectionEncoding';
import { ATMOSPHERE_PARAMS } from '../../../../data/bodies/atmosphereParams';
import { SCENE_BODIES } from '../../../../data/bodies/sceneBodies';
import { SCENE_MESH_BODIES } from '../../../../data/bodies/sceneMeshBodies';
import { SOLAR_RADIUS_KM } from '../../../../data/bodies/solarRadiusKm';
import { sunDirLocal } from '../../../../utils/camera/sunDirLocal';
import { narrowMat4 } from '../../../../utils/math/narrowMat4';
import { packMeshBodyUniforms } from '../../../../utils/gpu/packMeshBodyUniforms';
import { bodyStateInHostFrame } from '../../../../utils/scene/bodyStateInHostFrame';
import { meshBodiesAttachedTo } from '../../../../utils/scene/meshBodiesAttachedTo';
import { sunVisibleFraction } from '../../../../utils/scene/sunVisibleFraction';
import { bodySlabFlooredPick } from '../../helpers/bodySlabFlooredPick';
import { sceneBodyPartition } from '../sceneBodyPartition';
import { sceneBodyStates } from '../sceneBodyStates';
import { seedIndexOfBody } from './seedIndexOfBody';

const SUN_RADIUS_M = SOLAR_RADIUS_KM * SCALE_UNITS.KM_TO_M;

/**
 * Earthshine fill: the fragment's `SUN_IRRADIANCE` (3.0) times the ~0.4 of the
 * sky the host fills from low orbit, over the Lambert π that this fill term
 * (unlike `pbrDirect`) does not carry. The albedo half is `earthshineColor`.
 */
const EARTHSHINE_STRENGTH = 0.4;

/**
 * The mesh bodies this host row draws: attached to it, past the partition's
 * glint threshold, AND resident. ONE derivation behind `enabled`, `draw` and
 * `drawPick`, so the gate and the two draws cannot disagree. An empty
 * `SCENE_MESH_BODIES` short-circuits before `sceneBodyPartition` is touched.
 *
 * Residency is the demand-driven gate: a body inside the load radius but not
 * yet decoded draws nothing — invisible rather than a wrong shape (spec).
 */
function drawableMeshBodies(
  state: EngineState,
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

/**
 * `slabVp · translate(posM − eyeRelBodyM) · rotate(rotM)`, f64 throughout —
 * scale 1, because the mesh is authored in metres (unlike
 * `composeBodySlabMvp`'s unit sphere). Caller narrows at the uniform write.
 */
function composeMeshMvp(
  slabVp: Float64Array,
  posM: Readonly<Vec3>,
  eyeRelBodyM: Readonly<Vec3>,
  rotM: Readonly<Mat3>,
): Float64Array {
  // Hand embed of the tight 9-element `Mat3`: wgpu-matrix's own mat3 is a
  // 12-float PADDED layout (columns at 0/4/8), so `mat4d.fromMat3` would read
  // the wrong slots, and columns placed transposed mirror the body with no
  // compiler check. Same trap `composeBodyMvp` documents.
  const rot = new Float64Array([
    rotM[0],
    rotM[1],
    rotM[2],
    0,
    rotM[3],
    rotM[4],
    rotM[5],
    0,
    rotM[6],
    rotM[7],
    rotM[8],
    0,
    0,
    0,
    0,
    1,
  ]);
  const model = mat4d.multiply(
    mat4d.translation([
      posM[0] - eyeRelBodyM[0],
      posM[1] - eyeRelBodyM[1],
      posM[2] - eyeRelBodyM[2],
    ]),
    rot,
  ) as Float64Array;
  return mat4d.multiply(slabVp, model) as Float64Array;
}

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
    const earthshineColor: Vec3 = ATMOSPHERE_PARAMS[hostId]?.groundAlbedo ?? [0, 0, 0];

    for (const body of bodies) {
      const bodyState = bodyStates.get(body.id)!;
      const { posM, rotM } = bodyStateInHostFrame(bodyState, hostState);
      const distToHostM = Math.hypot(posM[0], posM[1], posM[2]);
      const invDist = distToHostM > 0 ? 1 / distToHostM : 0;
      renderer.draw(
        pass,
        body.id,
        packMeshBodyUniforms({
          // Narrow here, at the uniform write — the compose above is f64.
          mvp: narrowMat4(composeMeshMvp(view.slab.vp, posM, hostPose.eyeRelBodyM, rotM)),
          sunDirLocal: sunDirLocal(bodyState.positionMpc, RENDER_ORIGIN_MPC, hostState.orientation),
          sunVisibleFraction: sunVisibleFraction({
            bodyPosMpc: bodyState.positionMpc,
            sunPosMpc: RENDER_ORIGIN_MPC,
            hostPosMpc: hostState.positionMpc,
            sunRadiusM: SUN_RADIUS_M,
            hostRadiusM: host.radiusM,
          }),
          model: rotM,
          camPosLocal: [
            hostPose.eyeRelBodyM[0] - posM[0],
            hostPose.eyeRelBodyM[1] - posM[1],
            hostPose.eyeRelBodyM[2] - posM[2],
          ],
          earthshineStrength: EARTHSHINE_STRENGTH,
          earthshineColor,
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
