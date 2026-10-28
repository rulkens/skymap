/**
 * earthPass: Earth's `'body'`-slab content row, the base globe in `foreground:0`;
 * the detail patches over it are `surfaceTilesPass`. Earth's `body-m` row is itself
 * the visibility gate (culled at sub-pixel), so `enabled` checks the host id and the
 * foreground distance. `earthRenderer.draw` writes ONE non-dynamic uniform buffer,
 * so draw at most once per frame. The globe is ALWAYS drawn, at the datum's inner
 * bound, so it cannot occlude relief and covers ground no resident patch does yet.
 */

import type { ContentPass } from '../../../@types/engine/frame/ContentPass';
import type { BodyRuntime } from '../@types/BodyRuntime';
import { RENDER_ORIGIN_MPC } from '../../../data/renderOrigin';
import { SCALE_UNITS } from '../../../data/scaleUnits';
import { Source } from '../../../data/sources';
import { packSelection, PICK_SENTINEL_OFFSET } from '../../../data/selectionEncoding';
import { composeBodySlabMvp } from '../../../utils/camera/composeBodySlabMvp';
import { bodySlabCamLocal } from '../../../utils/camera/bodySlabCamLocal';
import { innerBoundRadiusM } from '../../../utils/occlusion/innerBoundRadiusM';
import { sunDirLocal } from '../../../utils/camera/sunDirLocal';
import { narrowMat4 } from '../../../utils/math/narrowMat4';
import { packEarthSurfaceUniforms } from '../render/packEarthSurfaceUniforms';
import { EARTH_SURFACE_PARAMS } from '../../../data/bodies/earthSurfaceParams';
import { CLOUD_SHELL_PARAMS } from '../present/cloudShellParams';
import { cloudDeckFade } from '../present/cloudDeckFade';
import { bodyCameraDistanceMpc } from '../present/bodyCameraDistanceMpc';
import { FOREGROUND_MAX_DISTANCE_MPC } from '../../../data/rendering/foregroundMaxDistance';
import { bodySlabFlooredPick } from '../../../services/engine/helpers/bodySlabFlooredPick';
import { prepareBodySurfaceFrame } from '../present/prepareBodySurfaceFrame';

export function earthPass(runtime: BodyRuntime): ContentPass {
  return {
    name: 'earth',

    enabled(_state, ctx, view) {
      if (view.slab.frame.kind !== 'body-m' || view.slab.frame.hostId !== 'earth') return false;
      return ctx.cam.distance < FOREGROUND_MAX_DISTANCE_MPC;
    },

    draw(pass, view, ctx, state) {
      const prepared = prepareBodySurfaceFrame(state, ctx, view);
      if (prepared === null) return;
      const { body, bodyState: earthState, radiusM } = prepared;
      // The INNER bound (datum + reliefM[0], never positive), so a below-datum trench is never occluded by the globe.
      const baseGlobeRadiusM = innerBoundRadiusM(body.surface);
      const mvp = narrowMat4(
        composeBodySlabMvp(view.slab.vp, prepared.pose.eyeRelBodyM, baseGlobeRadiusM),
      );
      const camLocal = bodySlabCamLocal(prepared.pose.eyeRelBodyM, baseGlobeRadiusM);
      const radiusMpc = radiusM * SCALE_UNITS.M_TO_MPC;

      const sun = sunDirLocal(earthState.positionMpc, RENDER_ORIGIN_MPC, earthState.orientation);
      // The deck and the shadow it casts must dissolve together. Known gap: the fade
      // does not reach the night-side city-lights dimming (nightLights reads
      // cloudAlphaHere with no strength scalar).
      const cloudFade = cloudDeckFade(
        bodyCameraDistanceMpc(earthState.positionMpc, ctx.drawCamPos),
        radiusMpc,
      );
      const cloudShadowStrength = EARTH_SURFACE_PARAMS.cloudShadowStrength * cloudFade;

      runtime.earthRenderer.draw(
        pass,
        packEarthSurfaceUniforms(
          mvp,
          sun,
          camLocal,
          EARTH_SURFACE_PARAMS.roughnessBase,
          EARTH_SURFACE_PARAMS.f0,
          EARTH_SURFACE_PARAMS.sunIrradiance,
          cloudShadowStrength,
          // The SAME shell cloudShellPass draws.
          CLOUD_SHELL_PARAMS.radiusRatio,
          // Live user settings, not the WESL consts.
          state.settings.earth.ambientLight,
          state.settings.earth.oceanRoughness,
        ),
      );
    },

    // Earth is the sole body of Source.Earth (seed index 0); PICK_SENTINEL_OFFSET
    // keeps a real hit distinct from the cleared no-hit texel.
    drawPick(pass, view, ctx, state) {
      const pickRenderer = state.gpu.bodyPickRenderer;
      if (pickRenderer === null) return;

      const prepared = prepareBodySurfaceFrame(state, ctx, view);
      if (prepared === null) return;
      const { pose, radiusM } = prepared;

      const { mvp, camPosLocal } = bodySlabFlooredPick(
        view.slab.vp,
        pose.eyeRelBodyM,
        radiusM,
        ctx.drawPxPerRad,
      );

      pickRenderer.drawSphere(pass, {
        mvp,
        camPosLocal,
        packedId: packSelection(Source.Earth, 0 + PICK_SENTINEL_OFFSET),
      });
    },
  };
}
