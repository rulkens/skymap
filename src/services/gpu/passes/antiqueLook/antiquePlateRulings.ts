/**
 * antiquePlateRulings — this frame's two ruling frames. The sky's axes follow
 * the orientation setting (ecliptic by default, as Hevelius ruled his plates) unless
 * the debug panel forces a frame;
 * a globe's are its body-fixed axes, numbered from its prime meridian
 * (`ANTIQUE_GLOBE_RULINGS`), and it rules the plate wherever it lies under the
 * view. Its interior net fades with its share of the plate and with the ground
 * scale; the border reads it at any value.
 */

import type { FrameView } from '../../../../@types/engine/frame/FrameView';
import type { PassState } from '../../../../@types/engine/frame/PassState';
import type { ViewBasis } from '../../../../@types/camera/projection/ViewBasis';
import type { ViewCornerRays } from '../../../../@types/camera/projection/ViewCornerRays';
import type { Vec3 } from '../../../../@types/math/Vec3';
import type { AntiquePlateRulings } from '../../../../@types/rendering/AntiquePlateRulings';
import type { AntiqueRulingFrame } from '../../../../@types/rendering/AntiqueRulingFrame';
import {
  ANTIQUE_GLOBE_NET_COVERAGE,
  ANTIQUE_GLOBE_NET_KM_PER_UNIT,
  ANTIQUE_GLOBE_RULINGS,
  ANTIQUE_SKY_RULING_AXES,
} from '../../../../data/rendering/antiqueRulings';
import { SCALE_UNITS } from '../../../../data/scaleUnits';
import { antiqueGlobeCastable } from '../../../../utils/gpu/antiqueLook/antiqueGlobeCastable';
import { antiqueGlobeCoverage } from '../../../../utils/gpu/antiqueLook/antiqueGlobeCoverage';
import { antiqueGraticuleSteps } from '../../../../utils/gpu/antiqueLook/antiqueGraticuleSteps';
import { smoothstep } from '../../../../utils/math/smoothstep';
import { innerBoundRadiusM } from '../../../../utils/occlusion/innerBoundRadiusM';
import { outerBoundRadiusM } from '../../../../utils/occlusion/outerBoundRadiusM';

export function antiquePlateRulings(
  state: PassState,
  ctx: FrameView,
  view: { readonly basis: ViewBasis; readonly rays: ViewCornerRays; readonly unitPx: number },
  /** foreground:0 drew bodies this frame: a globe that did not draw rules nothing. */
  hasBodies: boolean,
): AntiquePlateRulings {
  const { basis, rays, unitPx } = view;
  const { frustum, canvasSize: size } = ctx;
  const ruled = (frame: Omit<AntiqueRulingFrame, 'lon' | 'lat'>): AntiqueRulingFrame => ({
    ...frame,
    ...antiqueGraticuleSteps(frame, basis, frustum, size, unitPx),
  });
  const { skyRulings } = state.settings.antique.tuning;
  const sky = ruled({
    axes: ANTIQUE_SKY_RULING_AXES[
      skyRulings === 'orientation' ? state.settings.orientation : skyRulings
    ],
    lonOffsetDeg: 0,
    globeCentre: null,
    net: 1,
  });
  let globe: AntiqueRulingFrame | null = null;
  let widest = 0;
  for (const { body, lonOffsetDeg } of hasBodies ? ANTIQUE_GLOBE_RULINGS : []) {
    const radiusM = innerBoundRadiusM(body.surface);
    const p = ctx.snapshot.bodyStates.get(body.id);
    if (p === undefined) continue;
    const toRadii = SCALE_UNITS.MPC_TO_M / radiusM;
    const eye = ctx.drawCamPos;
    const centre: Vec3 = [0, 1, 2].map((i) => (p.positionMpc[i]! - eye[i]!) * toRadii) as Vec3;
    const cornerRays = [rays.tl, rays.tr, rays.bl, rays.br];
    const castable = antiqueGlobeCastable({
      centre,
      radiusM,
      outerRadiusM: outerBoundRadiusM(body.surface),
      cornerRays,
    });
    const coverage = castable ? antiqueGlobeCoverage(centre, basis, frustum, size) : 0;
    if (coverage <= widest) continue;
    widest = coverage;
    const altitudeKm = (Math.hypot(...centre) - 1) * radiusM * SCALE_UNITS.M_TO_KM;
    const kmPerUnit = altitudeKm / (ctx.drawPxPerRad / unitPx);
    const [coverFrom, coverTo] = ANTIQUE_GLOBE_NET_COVERAGE;
    const [fineKm, coarseKm] = ANTIQUE_GLOBE_NET_KM_PER_UNIT;
    globe = ruled({
      axes: p.orientation,
      lonOffsetDeg,
      globeCentre: centre,
      net: smoothstep(coverFrom, coverTo, coverage) * smoothstep(fineKm, coarseKm, kmPerUnit),
    });
  }
  return { sky, globe };
}
