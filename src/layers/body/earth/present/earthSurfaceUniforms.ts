/**
 * earthSurfaceUniforms — this frame's globe uniform record for one Earth slab row,
 * or null when the row has no surface frame. Shared by `earthPass` and the antique
 * look's `earthOceanMaskPass`, so the land map lies exactly under the drawn globe.
 */

import type { FrameView } from '../../../../@types/engine/frame/FrameView';
import type { PassState } from '../../../../@types/engine/frame/PassState';
import type { SlabView } from '../../../../@types/engine/frame/SlabView';
import { RENDER_ORIGIN_MPC } from '../../../../data/renderOrigin';
import { SCALE_UNITS } from '../../../../data/scaleUnits';
import { composeBodySlabMvp } from '../../../../utils/camera/bodyCompose/composeBodySlabMvp';
import { bodySlabCamLocal } from '../../../../utils/camera/bodyCompose/bodySlabCamLocal';
import { innerBoundRadiusM } from '../../../../utils/occlusion/innerBoundRadiusM';
import { sunDirLocal } from '../../../../utils/camera/bodyCompose/sunDirLocal';
import { narrowMat4 } from '../../../../utils/math/narrowMat4';
import { packEarthSurfaceUniforms } from '../render/packEarthSurfaceUniforms';
import { EARTH_SURFACE_PARAMS } from '../../surfaceTiles/format/data/earthSurfaceParams';
import { CLOUD_SHELL_PARAMS } from '../../clouds/data/cloudShellParams';
import { cloudDeckFade } from '../../clouds/present/cloudDeckFade';
import { bodyCameraDistanceMpc } from '../../slabs/present/bodyCameraDistanceMpc';
import { prepareBodySurfaceFrame } from '../../slabs/present/prepareBodySurfaceFrame';

export function earthSurfaceUniforms(
  state: PassState,
  ctx: FrameView,
  view: SlabView,
): Float32Array | null {
  const prepared = prepareBodySurfaceFrame(state, ctx, view);
  if (prepared === null) return null;
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

  return packEarthSurfaceUniforms(
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
  );
}
