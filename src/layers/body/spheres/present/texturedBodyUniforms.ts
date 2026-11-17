/**
 * texturedBodyUniforms — this frame's uniform record for the textured body on one
 * body slab row, or null when that row's body is not textured or has no pose.
 * Shared by `texturedBodiesPass` and the antique look's `bodyAlbedoMaskPass`, so the
 * albedo mask lies exactly under the drawn sphere. Every term reads ONE radius, the
 * body's INNER bound (as `earthPass`), so the globe sits under every terrain tile.
 */

import type { FrameView } from '../../../../@types/engine/frame/FrameView';
import type { PassState } from '../../../../@types/engine/frame/PassState';
import type { SlabView } from '../../../../@types/engine/frame/SlabView';
import type { BodyTextureId } from '../../../../@types/data/BodyTextureId';
import type { BodyRuntime } from '../../@types/BodyRuntime';
import { RENDER_ORIGIN_MPC } from '../../../../data/renderOrigin';
import { LIMB_DARKENING_PARAMS } from '../data/limbDarkeningParams';
import { ringRatios } from './ringRatios';
import { composeBodySlabMvp } from '../../../../utils/camera/bodyCompose/composeBodySlabMvp';
import { composeBodySlabCamRelVp } from '../../slabs/present/composeBodySlabCamRelVp';
import { bodySlabCamAltitudeSq } from '../../slabs/present/bodySlabCamAltitudeSq';
import { bodySlabCamLocal } from '../../../../utils/camera/bodyCompose/bodySlabCamLocal';
import { sunDirLocal } from '../../../../utils/camera/bodyCompose/sunDirLocal';
import { innerBoundRadiusM } from '../../../../utils/occlusion/innerBoundRadiusM';
import { packTexturedBodyUniforms } from '../render/packTexturedBodyUniforms';
import { narrowMat4 } from '../../../../utils/math/narrowMat4';
import { bodySceneBodyPartition } from '../../slabs/present/bodySceneBodyPartition';
import { sceneBodyStates } from '../../../../services/engine/frame/sceneBodyStates';

export function texturedBodyUniforms(
  state: PassState,
  ctx: FrameView,
  view: SlabView,
  runtime: Pick<BodyRuntime, 'texturedBodyRenderer'>,
  albedoMid = 0,
): { bodyId: BodyTextureId; uniforms: Float32Array } | null {
  if (view.slab.frame.kind !== 'body-m') return null;
  const hostId = view.slab.frame.hostId;
  const body = bodySceneBodyPartition(state, ctx, runtime).textured.find((b) => b.id === hostId);
  if (body === undefined) return null;
  const pose = ctx.bodyPose(hostId);
  if (pose === null) return null;

  const bodyState = sceneBodyStates(state, ctx).get(body.id)!;
  const radiusM = innerBoundRadiusM(body.surface);
  const mvp = composeBodySlabMvp(view.slab.vp, pose.eyeRelBodyM, radiusM);
  const sun = sunDirLocal(bodyState.positionMpc, RENDER_ORIGIN_MPC, bodyState.orientation);
  const { inner, outer } = ringRatios(body, radiusM);
  // No Minnaert row is the shader identity, strength 0.
  const { strength, exponent } = LIMB_DARKENING_PARAMS[body.id] ?? { strength: 0, exponent: 1 };
  // Narrow here, at the GPU uniform write — both composes return f64.
  const uniforms = packTexturedBodyUniforms(
    narrowMat4(mvp),
    sun,
    inner,
    outer,
    strength,
    exponent,
    bodySlabCamLocal(pose.eyeRelBodyM, radiusM),
    bodySlabCamAltitudeSq(pose.eyeRelBodyM, radiusM),
    narrowMat4(composeBodySlabCamRelVp(view.slab.vp, radiusM)),
    albedoMid,
  );
  // The partition only routes bodies with a BODY_TEXTURE_REGISTRY row into `textured`.
  return { bodyId: body.id as BodyTextureId, uniforms };
}
