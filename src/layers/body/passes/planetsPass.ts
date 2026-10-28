/**
 * planetsPass: the `flat` branch of the body partition as a true-scale flat-lit
 * albedo sphere, one `'body'`-slab row per body, gated on `view.slab.frame.hostId`
 * being in `flat` (resolved, texture not resident). A body is `flat` XOR `textured`
 * (`texturedBodiesPass`) XOR `glint` (`bodyGlintsPass`), so the opaque layers cannot
 * z-fight. One draw per row, not a batch: each body-m row has its own `view.slab.vp`,
 * and the renderer keys its instance buffer by `bodyId` because every row lands in
 * ONE submit (see `planetRenderer`). Pose: `ctx.bodyPose`, the closure `deriveSlabs`
 * built the vp from. This pass is also the sole pick site for `flat` and `textured`.
 */

import type { ContentPass } from '../../../@types/engine/frame/ContentPass';
import type { BodyRuntime } from '../@types/BodyRuntime';
import { RENDER_ORIGIN_MPC } from '../../../data/renderOrigin';
import { Source } from '../../../data/sources';
import { SCENE_PLANETS } from '../../../data/bodies/scenePlanets';
import { packSelection, PICK_SENTINEL_OFFSET } from '../../../data/selectionEncoding';
import { composeBodySlabMvp } from '../../../utils/camera/composeBodySlabMvp';
import { bodySlabCamLocal } from '../../../utils/camera/bodySlabCamLocal';
import { sunDirLocal } from '../../../utils/camera/sunDirLocal';
import { narrowMat4 } from '../../../utils/math/narrowMat4';
import { bodySceneBodyPartition } from '../present/bodySceneBodyPartition';
import { sceneBodyStates } from '../../../services/engine/frame/sceneBodyStates';
import { INSTANCE_FLOATS } from '../render/planetRenderer';
import { seedIndexOfBody } from '../../../utils/picking/seedIndexOfBody';
import { FOREGROUND_MAX_DISTANCE_MPC } from '../../../data/rendering/foregroundMaxDistance';
import { bodySlabFlooredPick } from '../../../services/engine/helpers/bodySlabFlooredPick';

// A `'body'` row draws at most one planet, so one record is reused.
const staging = new Float32Array(INSTANCE_FLOATS);

export function planetsPass(runtime: BodyRuntime): ContentPass {
  return {
    name: 'planets',

    enabled(state, ctx, view) {
      if (view.slab.frame.kind !== 'body-m') return false;
      // Distance first: the partition is the costly read.
      if (ctx.cam.distance >= FOREGROUND_MAX_DISTANCE_MPC) return false;
      const bodyId = view.slab.frame.hostId;
      return bodySceneBodyPartition(state, ctx, runtime).flat.some((p) => p.id === bodyId);
    },

    // Wider than `enabled`: the sole pick site for `flat` and `textured`, so a
    // textured-only row must stay pickable while its visual row leaves the pass plan.
    pickEnabled(state, ctx, view) {
      if (view.slab.frame.kind !== 'body-m') return false;
      if (ctx.cam.distance >= FOREGROUND_MAX_DISTANCE_MPC) return false;
      const bodyId = view.slab.frame.hostId;
      const { flat, textured } = bodySceneBodyPartition(state, ctx, runtime);
      return flat.some((p) => p.id === bodyId) || textured.some((p) => p.id === bodyId);
    },

    draw(pass, view, ctx, state) {
      if (view.slab.frame.kind !== 'body-m') return;
      const bodyId = view.slab.frame.hostId;
      const planet = bodySceneBodyPartition(state, ctx, runtime).flat.find((p) => p.id === bodyId);
      if (planet === undefined) return;
      const pose = ctx.bodyPose(bodyId);
      if (pose === null) return;

      const bodyState = sceneBodyStates(state, ctx).get(planet.id)!;
      const mvp = composeBodySlabMvp(view.slab.vp, pose.eyeRelBodyM, planet.surface.datumRadiusM);
      const sun = sunDirLocal(bodyState.positionMpc, RENDER_ORIGIN_MPC, bodyState.orientation);
      // The analytic ray's origin; a PAIR with the mvp, both from the same datum radius.
      const cam = bodySlabCamLocal(pose.eyeRelBodyM, planet.surface.datumRadiusM);

      // composeBodySlabMvp returns f64; narrow at the write.
      staging.set(narrowMat4(mvp), 0);
      staging[16] = planet.albedo[0];
      staging[17] = planet.albedo[1];
      staging[18] = planet.albedo[2];
      staging[19] = 0; // pad
      staging[20] = sun[0];
      staging[21] = sun[1];
      staging[22] = sun[2];
      staging[23] = 0; // pad
      staging[24] = cam[0];
      staging[25] = cam[1];
      staging[26] = cam[2];
      staging[27] = 0; // pad
      runtime.planetRenderer.draw(pass, bodyId, staging);
    },

    // The packed id carries the STABLE `SCENE_PLANETS` index, not a slot in any
    // resolved subset (`seedIndexOfBody`); -1 (absent) is skipped, else it aliases body 0.
    drawPick(pass, view, ctx, state) {
      const pickRenderer = state.gpu.bodyPickRenderer;
      if (pickRenderer === null || view.slab.frame.kind !== 'body-m') return;
      const bodyId = view.slab.frame.hostId;
      const { flat, textured } = bodySceneBodyPartition(state, ctx, runtime);
      const planet = flat.find((p) => p.id === bodyId) ?? textured.find((p) => p.id === bodyId);
      if (planet === undefined) return;
      const seedIndex = seedIndexOfBody(planet.id, SCENE_PLANETS);
      if (seedIndex < 0) return;
      const pose = ctx.bodyPose(bodyId);
      if (pose === null) return;

      const { mvp, camPosLocal } = bodySlabFlooredPick(
        view.slab.vp,
        pose.eyeRelBodyM,
        planet.surface.datumRadiusM,
        ctx.drawPxPerRad,
      );

      pickRenderer.drawSphere(pass, {
        mvp,
        camPosLocal,
        packedId: packSelection(Source.Planet, seedIndex + PICK_SENTINEL_OFFSET),
      });
    },
  };
}
