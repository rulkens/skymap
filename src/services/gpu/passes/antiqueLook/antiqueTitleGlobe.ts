/**
 * antiqueTitleGlobe — the widest globe with a cartouche title of its own
 * (`ANTIQUE_GLOBE_TITLES`), as `antiquePlateTitle` reads it: its apparent
 * radius in print units, the ground's scale under the eye in km per print unit,
 * where the plate's centre ray meets it (Greenwich longitude, so region boxes
 * read modern maps), and the share of the plate it covers.
 */

import type { FrameView } from '../../../../@types/engine/frame/FrameView';
import type { ViewBasis } from '../../../../@types/camera/projection/ViewBasis';
import type { Vec2 } from '../../../../@types/math/Vec2';
import type { Vec3 } from '../../../../@types/math/Vec3';
import { SCENE_BODIES } from '../../../../data/bodies/sceneBodies';
import { ANTIQUE_GLOBE_TITLES } from '../../../../data/rendering/antiqueGlobeTitles';
import { SCALE_UNITS } from '../../../../data/scaleUnits';
import { rayThroughPx } from '../../../../utils/camera/projection/rayThroughPx';
import { antiqueGlobeCoverage } from '../../../../utils/gpu/antiqueLook/antiqueGlobeCoverage';
import { rulingLonLat } from '../../../../utils/gpu/antiqueLook/rulingLonLat';
import { innerBoundRadiusM } from '../../../../utils/occlusion/innerBoundRadiusM';

export function antiqueTitleGlobe(
  ctx: FrameView,
  basis: ViewBasis,
  unitPx: number,
): {
  readonly id: string;
  readonly radiusUnits: number;
  readonly kmPerUnit: number;
  readonly centreLonLat: Readonly<Vec2> | null;
  readonly coverage: number;
} | null {
  const { frustum, canvasSize: size, drawCamPos: eye } = ctx;
  let widest: {
    body: (typeof SCENE_BODIES)[number];
    radiusM: number;
    centre: Vec3;
    radiusUnits: number;
  } | null = null;
  for (const body of SCENE_BODIES) {
    if (!(body.id in ANTIQUE_GLOBE_TITLES) || !('surface' in body)) continue;
    const p = ctx.snapshot.bodyStates.get(body.id);
    if (p === undefined) continue;
    const radiusM = innerBoundRadiusM(body.surface);
    const toRadii = SCALE_UNITS.MPC_TO_M / radiusM;
    const centre = [0, 1, 2].map((i) => (p.positionMpc[i]! - eye[i]!) * toRadii) as Vec3;
    // Angular radius from the eye, as print units at the plate's scale.
    const radiusUnits =
      (Math.asin(Math.min(1, 1 / Math.hypot(...centre))) * ctx.drawPxPerRad) / unitPx;
    if (widest === null || radiusUnits > widest.radiusUnits) widest = { body, radiusM, centre, radiusUnits };
  }
  if (widest === null) return null;
  const orientation = ctx.snapshot.bodyStates.get(widest.body.id)!.orientation;
  const ray = rayThroughPx([size.width / 2, size.height / 2], basis, frustum, size);
  return {
    id: widest.body.id,
    radiusUnits: widest.radiusUnits,
    kmPerUnit:
      ((Math.hypot(...widest.centre) - 1) * widest.radiusM * SCALE_UNITS.M_TO_KM) /
      (ctx.drawPxPerRad / unitPx),
    centreLonLat: rulingLonLat(
      { axes: orientation, lonOffsetDeg: 0, globeCentre: widest.centre },
      ray,
    ),
    coverage: antiqueGlobeCoverage(widest.centre, basis, frustum, size),
  };
}
