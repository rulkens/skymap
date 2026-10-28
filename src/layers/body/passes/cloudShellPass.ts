/**
 * cloudShellPass: Earth's translucent cloud deck as a `'body'`-slab content row in
 * the depth-bearing `foreground:0` target, a shell at `datumRadiusM x
 * CLOUD_SHELL_PARAMS.radiusRatio` just above the surface `earthPass` stamps.
 * Registered immediately AFTER `earthPass` (and before `atmosphereShellPass`): it
 * depth-TESTS against the surface (reversed-Z `greater`) but writes no depth, and
 * blends straight-alpha OVER. `insideShell` (camera below the shell radius) picks
 * the renderer's front-cull pipeline so the deck survives a descent through it.
 * The pose is `ctx.bodyPose(hostId)`, the closure `deriveSlabs` built `view.slab.vp`
 * from. Non-pickable (a translucent overlay has no silhouette; the click hits the
 * surface), so no `drawPick`. `enabled` and `draw` share ONE `cloudShellDraw`
 * derivation: a row that would draw nothing leaves the pass plan.
 */

import type { ContentPass } from '../../../@types/engine/frame/ContentPass';
import type { BodyRuntime } from '../@types/BodyRuntime';
import type { PassState } from '../../../@types/engine/frame/PassState';
import type { FrameView } from '../../../@types/engine/frame/FrameView';
import { RENDER_ORIGIN_MPC } from '../../../data/renderOrigin';
import { SCALE_UNITS } from '../../../data/scaleUnits';
import { CLOUD_SHELL_PARAMS } from '../present/cloudShellParams';
import { EARTH_SURFACE_PARAMS } from '../../../data/bodies/earthSurfaceParams';
import { bodyTextureSlotKey } from '../../../utils/bodyTextures/bodyTextureSlotKey';
import { cloudDeckFade } from '../present/cloudDeckFade';
import { composeBodySlabMvp } from '../../../utils/camera/composeBodySlabMvp';
import { sunDirLocal } from '../../../utils/camera/sunDirLocal';
import { narrowMat4 } from '../../../utils/math/narrowMat4';
import { packCloudShellUniforms } from '../render/packCloudShellUniforms';
import { apparentSizePx } from '../../../utils/math/apparentSizePx';
import { FOREGROUND_MAX_DISTANCE_MPC } from '../../../data/rendering/foregroundMaxDistance';
import { SUB_PIXEL_BODY_CULL_PX } from '../../../services/engine/frame/subPixelBodyCullPx';
import { sceneBodyStates } from '../../../services/engine/frame/sceneBodyStates';
import type { PositionedId } from '../../../@types/scene/PositionedId';
import { SCENE_EARTH } from '../../../data/bodies/sceneEarth';

/** The descent-fade multiplier, and whether the camera is inside the shell radius. */
type CloudShellDraw = {
  readonly deckFade: number;
  readonly insideShell: boolean;
};

/**
 * The fade and inside-shell flag for `bodyId`, or `null` if the shell should not
 * render: not Earth, clouds map not committed, sub-pixel, or the fade reached 0.
 */
function cloudShellDraw(
  state: PassState,
  ctx: FrameView,
  bodyId: PositionedId,
  runtime: BodyRuntime,
): CloudShellDraw | null {
  if (SCENE_EARTH.id !== bodyId) return null;
  // Without a committed bitmap the shell would draw a fully transparent sphere.
  if (runtime.textureSlots.get(bodyTextureSlotKey('earth', 'clouds'))?.current() == null)
    return null;
  const earthPos = sceneBodyStates(state, ctx).get(SCENE_EARTH.id)!.positionMpc;
  const dx = earthPos[0] - ctx.drawCamPos[0];
  const dy = earthPos[1] - ctx.drawCamPos[1];
  const dz = earthPos[2] - ctx.drawCamPos[2];
  const distanceMpc = Math.hypot(dx, dy, dz);
  // Before the sub-pixel cull, so it also covers that cull's distanceMpc === 0 case.
  const bodyRadiusMpc = SCENE_EARTH.surface.datumRadiusM * SCALE_UNITS.M_TO_MPC;
  const deckFade = cloudDeckFade(distanceMpc, bodyRadiusMpc);
  if (deckFade <= 0) return null;
  // The cloud shell's radius (body radii), not `atmosphereInsideBand`'s atmosphere-top ratio.
  const insideShell = distanceMpc / bodyRadiusMpc < CLOUD_SHELL_PARAMS.radiusRatio;
  // apparentSizePx returns 0 at zero distance (camera inside the body), handled above.
  if (distanceMpc === 0) return { deckFade, insideShell };
  const diameterPx = apparentSizePx({
    diameterKpc:
      (2 * SCENE_EARTH.surface.datumRadiusM * SCALE_UNITS.M_TO_MPC) / SCALE_UNITS.KPC_TO_MPC,
    distanceMpc,
    pxPerRad: ctx.drawPxPerRad,
  });
  return diameterPx >= SUB_PIXEL_BODY_CULL_PX ? { deckFade, insideShell } : null;
}

export function cloudShellPass(runtime: BodyRuntime): ContentPass {
  return {
    name: 'cloud-shell',

    enabled(state, ctx, view) {
      if (view.slab.frame.kind !== 'body-m') return false;
      if (ctx.cam.distance >= FOREGROUND_MAX_DISTANCE_MPC) return false;
      return cloudShellDraw(state, ctx, view.slab.frame.hostId, runtime) !== null;
    },

    draw(pass, view, ctx, state) {
      if (view.slab.frame.kind !== 'body-m') return;
      const drawInputs = cloudShellDraw(state, ctx, view.slab.frame.hostId, runtime);
      if (drawInputs === null) return;
      const { deckFade, insideShell } = drawInputs;
      const pose = ctx.bodyPose(view.slab.frame.hostId);
      if (pose === null) return;

      const earthState = sceneBodyStates(state, ctx).get(SCENE_EARTH.id)!;

      // Metres, the body-m slab frame's own unit.
      const shellRadiusM = SCENE_EARTH.surface.datumRadiusM * CLOUD_SHELL_PARAMS.radiusRatio;
      const mvp = composeBodySlabMvp(view.slab.vp, pose.eyeRelBodyM, shellRadiusM);
      // Rotated into Earth's local frame (axial tilt), co-framed with the surface.
      const sun = sunDirLocal(earthState.positionMpc, RENDER_ORIGIN_MPC, earthState.orientation);
      // Irradiance and ambient are the SAME values the surface reads, so the deck matches the ground.
      runtime.cloudShellRenderer.draw(
        pass,
        packCloudShellUniforms(
          // Narrow here, at the GPU uniform write — composeBodySlabMvp returns f64.
          narrowMat4(mvp),
          sun,
          CLOUD_SHELL_PARAMS.opacity * deckFade,
          EARTH_SURFACE_PARAMS.sunIrradiance,
          state.settings.earth.ambientLight,
        ),
        insideShell,
      );
    },
  };
}
