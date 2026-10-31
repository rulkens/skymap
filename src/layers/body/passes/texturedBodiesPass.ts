/**
 * texturedBodiesPass: the `textured` branch of the body partition, a resolved
 * resident-texture body drawn as a lit surface-mapped sphere, one `'body'`-slab row
 * per body. Its sibling `planetsPass` takes the `flat` branch, so a body is
 * textured XOR flat and the two opaque layers cannot z-fight; a body whose texture
 * has not landed is `flat`. Ring ratios and Minnaert limb params are DATA on the
 * uniform (`ringOuterRatio == 0` and `strength 0` are the identities). The mvp,
 * `camPosLocal`, altitude term, eye-relative vp and ring ratios all read ONE
 * radius, the body's INNER bound (as `earthPass`), so the globe sits under every
 * terrain tile. No pick aspect: `planetsPass` is the sole pick site for flat and
 * textured. Pose: `ctx.bodyPose`, the closure `deriveSlabs` built the vp from.
 */

import type { ContentPass } from '../../../@types/engine/frame/ContentPass';
import type { BodyRuntime } from '../@types/BodyRuntime';
import type { BodyTextureId } from '../../../@types/data/BodyTextureId';
import type { PlanetBody } from '../../../@types/scene/PlanetBody';
import { SCALE_UNITS } from '../../../data/scaleUnits';
import { SCENE_RINGS } from '../../../data/bodies/sceneRings';
import { LIMB_DARKENING_PARAMS } from '../present/limbDarkeningParams';
import { composeBodySlabMvp } from '../../../utils/camera/composeBodySlabMvp';
import { composeBodySlabCamRelVp } from '../present/composeBodySlabCamRelVp';
import { bodySlabCamAltitudeSq } from '../present/bodySlabCamAltitudeSq';
import { bodySlabCamLocal } from '../../../utils/camera/bodySlabCamLocal';
import { lightDirLocal } from '../../../utils/camera/lightDirLocal';
import { lightSourceMpc } from '../../../utils/scene/lightSourceMpc';
import { innerBoundRadiusM } from '../../../utils/occlusion/innerBoundRadiusM';
import { packTexturedBodyUniforms } from '../render/packTexturedBodyUniforms';
import { narrowMat4 } from '../../../utils/math/narrowMat4';
import { bodySceneBodyPartition } from '../present/bodySceneBodyPartition';
import { sceneBodyStates } from '../../../services/engine/frame/sceneBodyStates';

/** Ring radii in planet-radius units, or `(0, 0)` (the fragment's "no ring" sentinel). */
function ringRatios(body: PlanetBody, radiusM: number): { inner: number; outer: number } {
  const ring = SCENE_RINGS.find((r) => r.bodyId === body.id);
  if (ring === undefined) return { inner: 0, outer: 0 };
  // The ring table is authored in km, the body in metres.
  const bodyRadiusKm = radiusM * SCALE_UNITS.M_TO_KM;
  return { inner: ring.innerRadiusKm / bodyRadiusKm, outer: ring.outerRadiusKm / bodyRadiusKm };
}

/** Minnaert params, or `{ strength: 0, exponent: 1 }` (the shader identity) when absent. */
function limbParams(body: PlanetBody): { strength: number; exponent: number } {
  return LIMB_DARKENING_PARAMS[body.id] ?? { strength: 0, exponent: 1 };
}

export function texturedBodiesPass(runtime: BodyRuntime): ContentPass {
  return {
    name: 'textured-bodies',

    enabled(state, ctx, view) {
      if (view.slab.frame.kind !== 'body-m') return false;
      const bodyId = view.slab.frame.hostId;
      return bodySceneBodyPartition(state, ctx, runtime).textured.some((b) => b.id === bodyId);
    },

    draw(pass, view, ctx, state) {
      if (view.slab.frame.kind !== 'body-m') return;
      const bodyId = view.slab.frame.hostId;
      const body = bodySceneBodyPartition(state, ctx, runtime).textured.find(
        (b) => b.id === bodyId,
      );
      if (body === undefined) return;
      const pose = ctx.bodyPose(bodyId);
      if (pose === null) return;

      const bodyState = sceneBodyStates(state, ctx).get(body.id)!;
      const radiusM = innerBoundRadiusM(body.surface);
      const mvp = composeBodySlabMvp(view.slab.vp, pose.eyeRelBodyM, radiusM);
      const sun = lightDirLocal(
        bodyState.positionMpc,
        lightSourceMpc(body.id, sceneBodyStates(state, ctx)),
        bodyState.orientation,
      );
      const { inner, outer } = ringRatios(body, radiusM);
      const { strength, exponent } = limbParams(body);
      const cam = bodySlabCamLocal(pose.eyeRelBodyM, radiusM);
      // Narrow here, at the GPU uniform write — both composes return f64.
      const uniforms = packTexturedBodyUniforms(
        narrowMat4(mvp),
        sun,
        inner,
        outer,
        strength,
        exponent,
        cam,
        bodySlabCamAltitudeSq(pose.eyeRelBodyM, radiusM),
        narrowMat4(composeBodySlabCamRelVp(view.slab.vp, radiusM)),
      );
      // The partition only routes bodies with a BODY_TEXTURE_REGISTRY row into `textured`.
      runtime.texturedBodyRenderer.draw(pass, body.id as BodyTextureId, uniforms);
    },
  };
}
