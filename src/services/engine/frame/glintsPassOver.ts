/**
 * glintsPassOver — the sub-pixel bodies of one roster as additive glints through the owner's
 * own glint renderer, on `bodyGlintsPass`'s terms: the same brightness, the same far dissolve,
 * the same NEAR0 step, camera-relative anchors paired with a rebased vp (the f64 seam). No
 * `drawPick`: glints stay unpicked.
 */

import type { ContentPass } from '../../../@types/engine/frame/ContentPass';
import type { BodyGlintRenderer } from '../../../@types/rendering/BodyGlintRenderer';
import { FOREGROUND_MAX_DISTANCE_MPC } from '../../../data/rendering/foregroundMaxDistance';
import { BODY_GLINT_INSTANCE_FLOATS } from '../../../data/rendering/bodyGlintInstanceFloats';
import { sceneBodyPartition } from './sceneBodyPartition';
import { sceneBodyStates } from './sceneBodyStates';
import { bodyGlintBackdropFade } from '../../../utils/scene/bodyGlintBackdropFade';
import { packBodyGlints } from '../../../utils/scene/packBodyGlints';
import { rebaseViewProj } from '../../../utils/camera/rebaseViewProj';
import { narrowMat4 } from '../../../utils/math/narrowMat4';

export function glintsPassOver(
  name: string,
  roster: ReadonlySet<string>,
  renderer: BodyGlintRenderer,
): ContentPass {
  // Reused across frames: the hot path allocates nothing. One record per body at most.
  const staging = new Float32Array(roster.size * BODY_GLINT_INSTANCE_FLOATS);

  return {
    name,

    enabled(state, ctx, _view) {
      if (ctx.cam.distance >= FOREGROUND_MAX_DISTANCE_MPC) return false;
      if (bodyGlintBackdropFade(ctx.drawCamPos, sceneBodyStates(state, ctx)) <= 0) return false;
      return sceneBodyPartition(state, ctx, roster, () => false).glints.length > 0;
    },

    draw(pass, view, ctx, state) {
      const { glints } = sceneBodyPartition(state, ctx, roster, () => false);
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
      renderer.draw(pass, staging, count, rebasedVp, view.viewportPx, ctx.drawPxPerRad);
    },
  };
}
