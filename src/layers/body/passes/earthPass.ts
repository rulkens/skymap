/**
 * earthPass — Earth's `'body'`-slab content row: the base globe, drawn into
 * `foreground:0`. The detail patches over it are `surfaceTilesPass`.
 *
 * Earth's `body-m` slab row IS the visibility gate (Task 1 culls it at
 * sub-pixel), so `enabled` mainly checks `view.slab.frame.hostId === 'earth'`;
 * the foreground-distance check below is the one gate this layer still owns,
 * shared with `planetsPass`.
 *
 * `earthRenderer.draw` writes ONE non-dynamic uniform buffer, so this row
 * draws the base globe AT MOST once per frame (see that renderer's header for
 * the `writeBuffer`-vs-`submit` race a second draw would trigger). The globe is
 * ALWAYS drawn: it sits at the datum's inner bound (§7.4), so it cannot occlude
 * relief, and it is what covers ground no resident patch does yet.
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
      // The base globe alone draws at the INNER bound (datum + reliefM[0], never
      // positive) so a below-datum trench can never be occluded by it (§7.4,
      // F2-R5) — its own frame, composed here at the GPU-upload boundary.
      const baseGlobeRadiusM = innerBoundRadiusM(body.surface);
      const mvp = narrowMat4(
        composeBodySlabMvp(view.slab.vp, prepared.pose.eyeRelBodyM, baseGlobeRadiusM),
      );
      const camLocal = bodySlabCamLocal(prepared.pose.eyeRelBodyM, baseGlobeRadiusM);
      const radiusMpc = radiusM * SCALE_UNITS.M_TO_MPC;

      // Sun direction rotated into Earth's local frame (orientation carries the
      // axial tilt), so the fragment's lighting stays a plain dot product.
      const sun = sunDirLocal(earthState.positionMpc, RENDER_ORIGIN_MPC, earthState.orientation);
      // Same descent fade the cloud shell itself uses, from the same
      // camera-to-Earth-centre distance enabled's sub-pixel cull reads — the deck
      // and the shadow it casts must dissolve together.
      //
      // KNOWN OMISSION: this fade does not reach the night-side city-lights
      // dimming (nightLights reads cloudAlphaHere with no strength scalar).
      // Fixing that needs one more uniform field — deferred rather than paid
      // for a night-side-only artifact.
      const cloudFade = cloudDeckFade(
        bodyCameraDistanceMpc(earthState.positionMpc, ctx.drawCamPos),
        radiusMpc,
      );
      const cloudShadowStrength = EARTH_SURFACE_PARAMS.cloudShadowStrength * cloudFade;

      runtime.earth.draw(
        pass,
        packEarthSurfaceUniforms(
          mvp,
          sun,
          camLocal,
          EARTH_SURFACE_PARAMS.roughnessBase,
          EARTH_SURFACE_PARAMS.f0,
          EARTH_SURFACE_PARAMS.sunIrradiance,
          cloudShadowStrength,
          // Unit-sphere local radius of the SAME shell cloudShellPass draws, so
          // the cast shadow and the drawn deck agree by construction.
          CLOUD_SHELL_PARAMS.radiusRatio,
          // Live user settings, not the WESL consts (seeded from
          // EARTH_SURFACE_PARAMS so the defaults match).
          state.settings.earth.ambientLight,
          state.settings.earth.oceanRoughness,
        ),
      );
    },

    // Stamps Earth's packed identity into the body-slab r32uint pick pass.
    // Earth is the sole body of Source.Earth, so its seed index is the
    // constant 0; the packed id's PICK_SENTINEL_OFFSET keeps a real hit
    // distinct from the cleared-to-zero no-hit texel.
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
