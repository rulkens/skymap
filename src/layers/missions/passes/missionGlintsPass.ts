/**
 * missionGlintsPass — the sub-pixel craft as additive glints through the Layer's own glint
 * renderer, on `bodyGlintsPass`'s terms: the same brightness, the same far dissolve, the same
 * NEAR0 step, camera-relative anchors paired with a rebased vp (the f64 seam). No `drawPick`:
 * craft glints stay unpicked, as they were under core.
 */

import type { ContentPass } from '../../../@types/engine/frame/ContentPass';
import type { MissionsRuntime } from '../@types/MissionsRuntime';
import { FOREGROUND_MAX_DISTANCE_MPC } from '../../../data/rendering/foregroundMaxDistance';
import { BODY_GLINT_INSTANCE_FLOATS } from '../../../data/rendering/bodyGlintInstanceFloats';
import { sceneBodyPartition } from '../../../services/engine/frame/sceneBodyPartition';
import { sceneBodyStates } from '../../../services/engine/frame/sceneBodyStates';
import { bodyGlintBackdropFade } from '../../../utils/scene/bodyGlintBackdropFade';
import { packBodyGlints } from '../../../utils/scene/packBodyGlints';
import { rebaseViewProj } from '../../../utils/camera/rebaseViewProj';
import { narrowMat4 } from '../../../utils/math/narrowMat4';
import { MISSION_CRAFT_IDS } from '../present/missionCraftIds';

export function missionGlintsPass(runtime: MissionsRuntime): ContentPass {
  // Reused across frames: the hot path allocates nothing. One record per craft at most.
  const staging = new Float32Array(MISSION_CRAFT_IDS.size * BODY_GLINT_INSTANCE_FLOATS);

  return {
    name: 'mission-glints',

    enabled(state, ctx, _view) {
      if (ctx.cam.distance >= FOREGROUND_MAX_DISTANCE_MPC) return false;
      if (bodyGlintBackdropFade(ctx.drawCamPos, sceneBodyStates(state, ctx)) <= 0) return false;
      return sceneBodyPartition(state, ctx, MISSION_CRAFT_IDS, () => false).glints.length > 0;
    },

    draw(pass, view, ctx, state) {
      const { glints } = sceneBodyPartition(state, ctx, MISSION_CRAFT_IDS, () => false);
      const states = sceneBodyStates(state, ctx);
      const camPos = view.camPos;
      const count = packBodyGlints(staging, glints, {
        states,
        camPosMpc: camPos,
        pxPerRad: ctx.drawPxPerRad,
        backdropFade: bodyGlintBackdropFade(camPos, states),
      });
      if (count === 0) return;
      const rebasedVp = narrowMat4(rebaseViewProj(view.slab.vp, camPos));
      runtime.glintRenderer.draw(
        pass,
        staging,
        count,
        rebasedVp,
        view.viewportPx,
        ctx.drawPxPerRad,
      );
    },
  };
}
