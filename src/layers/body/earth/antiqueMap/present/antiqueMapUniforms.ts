/**
 * antiqueMapUniforms — the geography row's uniform record for Earth's slab row
 * (byte map in `earth/antiqueMap/io.wesl`), or null without a surface frame. The
 * MVP is the one `earthSurfaceUniforms` builds, so the map lies on the drawn
 * globe. `detail` is the reveal level: log2 of print units per km of ground
 * under the eye over ANTIQUE_MAP_DETAIL_BASE, so each level doubles the scale.
 */

import type { FrameView } from '../../../../../@types/engine/frame/FrameView';
import type { PassState } from '../../../../../@types/engine/frame/PassState';
import type { SlabView } from '../../../../../@types/engine/frame/SlabView';
import { ANTIQUE_REFERENCE_HEIGHT_CSS } from '../../../../../data/rendering/antiqueLook';
import { composeBodySlabMvp } from '../../../../../utils/camera/bodyCompose/composeBodySlabMvp';
import { bodySlabCamLocal } from '../../../../../utils/camera/bodyCompose/bodySlabCamLocal';
import { innerBoundRadiusM } from '../../../../../utils/occlusion/innerBoundRadiusM';
import { narrowMat4 } from '../../../../../utils/math/narrowMat4';
import { prepareBodySurfaceFrame } from '../../../slabs/present/prepareBodySurfaceFrame';
import { ANTIQUE_MAP_DETAIL_BASE } from '../data/antiqueMapReveal';
import { ANTIQUE_MAP_UNIFORM_FLOATS } from '../data/antiqueEarthMapFormat';

export function antiqueMapUniforms(
  state: PassState,
  ctx: FrameView,
  view: SlabView,
): Float32Array | null {
  const prepared = prepareBodySurfaceFrame(state, ctx, view);
  if (prepared === null) return null;
  const radiusM = innerBoundRadiusM(prepared.body.surface);
  const eye = prepared.pose.eyeRelBodyM;
  const unitPx = ctx.canvasSize.height / ANTIQUE_REFERENCE_HEIGHT_CSS;
  const altitudeKm = Math.max(Math.hypot(eye[0], eye[1], eye[2]) - radiusM, 1) / 1000;
  const unitsPerKm = ctx.drawPxPerRad / unitPx / altitudeKm;

  const out = new Float32Array(ANTIQUE_MAP_UNIFORM_FLOATS);
  out.set(narrowMat4(composeBodySlabMvp(view.slab.vp, eye, radiusM)), 0);
  out.set(bodySlabCamLocal(eye, radiusM), 16);
  out[19] = unitPx;
  out[20] = ctx.canvasSize.width;
  out[21] = ctx.canvasSize.height;
  out[22] = Math.log2(unitsPerKm / ANTIQUE_MAP_DETAIL_BASE);
  out[23] = radiusM / 1000;
  return out;
}
