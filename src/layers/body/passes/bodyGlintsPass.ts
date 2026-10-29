/**
 * bodyGlintsPass: the `glints` branch of `sceneBodyPartition` (bodies whose apparent
 * diameter is below `BODY_GLINT_MAX_PX`) as additive point sprites in the HDR target.
 * `planetsPass` / `texturedBodiesPass` draw the other branches of the SAME partition,
 * so a body is a glint XOR a mesh. Body roster only: missions, earthScenes and the
 * black holes glint through their own Layers' instances of the pipeline.
 *
 * Brightness is `bodyGlintBrightness` (size x albedo x phase) times two fade bands:
 * `bodyGlint` (apparent px, full at 1 px, gone at 3 px: the popless handoff to the
 * mesh) and `bodyGlintBackdrop` (camera distance from the solar system, so the ~22
 * minimum-size sprites do not collapse into one bright dot on pull-back). A glint
 * rounding to 0 is not packed (opacity 0 means no render). Like `starPointsPass` it
 * projects through NEAR0 and hands the renderer f64 camera-relative anchors with
 * the REBASED vp, so the f32 upload does not cancel.
 */

import type { ContentPass } from '../../../@types/engine/frame/ContentPass';
import type { BodyRuntime } from '../@types/BodyRuntime';
import type { FrameView } from '../../../@types/engine/frame/FrameView';
import type { Vec3 } from '../../../@types/math/Vec3';
import type { BodyGlintPick } from '../../../@types/rendering/bodyPickRenderer/BodyGlintPick';
import { Source } from '../../../data/sources';
import { SCENE_PLANETS } from '../../../data/bodies/scenePlanets';
import { packSelection, PICK_SENTINEL_OFFSET } from '../../../data/selectionEncoding';
import { bodySceneBodyPartition } from '../present/bodySceneBodyPartition';
import { sceneBodyStates } from '../../../services/engine/frame/sceneBodyStates';
import { seedIndexOfBody } from '../../../utils/picking/seedIndexOfBody';
import { glintBandClass } from '../present/glintBandClass';
import { bodyApparentDiameterPx } from '../../../utils/scene/bodyApparentDiameterPx';
import { bodyFootprintRadiusM } from '../../../utils/scene/bodyFootprintRadiusM';
import { bodyGlintBrightnessOf } from '../../../utils/scene/bodyGlintBrightnessOf';
import { bodyGlintBackdropFade } from '../../../utils/scene/bodyGlintBackdropFade';
import { packBodyGlints } from '../../../utils/scene/packBodyGlints';
import { rebaseViewProj } from '../../../utils/camera/rebaseViewProj';
import { narrowMat4 } from '../../../utils/math/narrowMat4';
import { SOLAR_SYSTEM_LABEL_MAX_DISTANCE_MPC } from '../../../data/labels/solarSystemLabelMaxDistance';
import { GLINT_MIN_BRIGHTNESS } from '../../../data/rendering/glintMinBrightness';
import { MAX_GLINTS } from '../../../services/gpu/renderers/bodies/bodyGlintRenderer';
import { BODY_GLINT_INSTANCE_FLOATS } from '../../../data/rendering/bodyGlintInstanceFloats';
import { SCENE_EARTH } from '../../../data/bodies/sceneEarth';

// Reused every frame: the hot path allocates nothing.
const staging = new Float32Array(MAX_GLINTS * BODY_GLINT_INSTANCE_FLOATS);

/** `pickEnabled` and `drawPick` must agree on the Earth caption gate, so it is spelled once. */
function earthCaptionPickable(ctx: FrameView): boolean {
  return ctx.cam.distance < SOLAR_SYSTEM_LABEL_MAX_DISTANCE_MPC;
}

export function bodyGlintsPass(runtime: BodyRuntime): ContentPass {
  return {
    name: 'body-glints',

    enabled(state, ctx, _view) {
      // Opacity 0 means no render: disable rather than pack invisible points.
      if (bodyGlintBackdropFade(ctx.drawCamPos, sceneBodyStates(state, ctx)) <= 0) return false;
      return bodySceneBodyPartition(state, ctx, runtime).glints.length > 0;
    },

    // Wider than `enabled`: this pass also carries Earth's pick stamp (see
    // `drawPick`), so the row is admitted whenever the Earth caption invites a click
    // even with an empty `glints` branch. Past the backdrop dissolve with no caption,
    // every glint `drawPick` would stamp is skipped, so the row has nothing to pick.
    pickEnabled(state, ctx, _view) {
      const backdropFade = bodyGlintBackdropFade(ctx.drawCamPos, sceneBodyStates(state, ctx));
      if (backdropFade <= 0 && !earthCaptionPickable(ctx)) return false;
      if (bodySceneBodyPartition(state, ctx, runtime).glints.length > 0) return true;
      return earthCaptionPickable(ctx);
    },

    draw(pass, view, ctx, state) {
      const { glints } = bodySceneBodyPartition(state, ctx, runtime);
      // Live positions from the per-frame snapshot, not the baked record fields.
      const states = sceneBodyStates(state, ctx);

      const camPos = view.camPos;

      const count = packBodyGlints(staging, glints, {
        states,
        camPosMpc: camPos,
        pxPerRad: ctx.drawPxPerRad,
        backdropFade: bodyGlintBackdropFade(camPos, states),
      });
      if (count === 0) return;

      // The slab's f64 `vp`, not the f32 `view.vp`; narrowed here at the upload boundary.
      const rebasedVp = narrowMat4(rebaseViewProj(view.slab.vp, camPos));
      runtime.bodyGlintRenderer.draw(
        pass,
        staging,
        count,
        rebasedVp,
        view.viewportPx,
        ctx.drawPxPerRad,
      );
    },

    // Stamps the `glints` partition into the NEAR0 pick pass as ONE instanced draw, so
    // a sub-pixel planet stays pickable. Each id carries the STABLE `SCENE_PLANETS`
    // index (the `Source.Planet` code `planetsPass` also stamps), not its partition
    // slot, which shifts as a body crosses `BODY_GLINT_MAX_PX`. Pick follows the
    // visible AFFORDANCE: within the caption range that is the body's flat-gated
    // label, so a glint dissolved to 0 stays clickable there; beyond it the skip
    // recomputes `draw`'s EXACT brightness against `GLINT_MIN_BRIGHTNESS`. Each point
    // carries a priority class (`glintBandClass`: 0 earth, 1 planet, 2 moon) that the
    // `'glint'` variant maps to a pick-depth band (`starPointPick.wesl`), so list
    // order carries no priority.
    drawPick(pass, view, ctx, state) {
      const pickRenderer = state.gpu.bodyPickRenderer;
      if (pickRenderer === null) return;

      const { glints } = bodySceneBodyPartition(state, ctx, runtime);
      const states = sceneBodyStates(state, ctx);

      const camPos = view.camPos;
      // The same far-dissolve alpha `draw` folds in, hoisted (per-frame constant).
      const backdropFade = bodyGlintBackdropFade(camPos, states);
      const pickPoints: BodyGlintPick[] = [];

      // Earth is not in the partition (it rides `SCENE_EARTH`), so without this stamp the
      // Moon's 18 px footprint would own the area and steal the click. Class 0 is the
      // shallowest band (`lib/pickDepthBands.wesl`). Gated on the caption range, not
      // `earthPass.enabled`, which dies ten orders of magnitude earlier while the label
      // still shows; the stamp writes the SAME `Source.Earth` id the sphere pick does.
      if (earthCaptionPickable(ctx)) {
        const earthPos = states.get(SCENE_EARTH.id)!.positionMpc;
        pickPoints.push({
          posRelCamMpc: [
            earthPos[0] - camPos[0],
            earthPos[1] - camPos[1],
            earthPos[2] - camPos[2],
          ] as Vec3,
          packedId: packSelection(Source.Earth, 0 + PICK_SENTINEL_OFFSET),
          bandClass: glintBandClass('earth'),
        });
      }

      for (const body of glints) {
        const seedIndex = seedIndexOfBody(body.id, SCENE_PLANETS);
        if (seedIndex < 0) continue; // a packed id from -1 would alias body 0.

        const positionMpc = states.get(body.id)!.positionMpc;

        // Beyond the caption range no label invites the click, so a glint that renders
        // no pixels (unlit side, faded at the 3 px crossover, far-dissolved) must not
        // claim a pick footprint; within it the label carries the click.
        const diameterPx = bodyApparentDiameterPx({
          positionMpc,
          radiusM: bodyFootprintRadiusM(body),
          camPosMpc: camPos,
          pxPerRad: ctx.drawPxPerRad,
        });
        const brightness = bodyGlintBrightnessOf(
          body.albedo,
          positionMpc,
          camPos,
          diameterPx,
          backdropFade,
        );
        if (
          brightness <= GLINT_MIN_BRIGHTNESS &&
          ctx.cam.distance >= SOLAR_SYSTEM_LABEL_MAX_DISTANCE_MPC
        )
          continue;

        pickPoints.push({
          posRelCamMpc: [
            positionMpc[0] - camPos[0],
            positionMpc[1] - camPos[1],
            positionMpc[2] - camPos[2],
          ] as Vec3,
          packedId: packSelection(Source.Planet, seedIndex + PICK_SENTINEL_OFFSET),
          bandClass: glintBandClass(body.id),
        });
      }

      const rebasedVp = narrowMat4(rebaseViewProj(view.slab.vp, camPos));
      pickRenderer.drawPoints(pass, {
        vp: rebasedVp,
        viewportPx: view.viewportPx,
        pxPerRad: ctx.drawPxPerRad,
        points: pickPoints,
        variant: 'glint',
      });
    },
  };
}
