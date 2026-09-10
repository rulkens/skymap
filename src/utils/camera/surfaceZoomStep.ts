import type { BodyFixedPose } from '../../@types/camera/BodyFixedPose';
import type { SurfaceGesture } from '../../@types/camera/SurfaceGesture';
import type { Vec2 } from '../../@types/math/Vec2';
import type { Vec3 } from '../../@types/math/Vec3';
import { anchoredZoomStep } from './anchoredZoomStep';
import { bodyFixedEyeM } from './bodyFixedEyeM';
import { bodyUpWeight } from './bodyUpWeight';
import { cursorRayBodyLocal } from './cursorRayBodyLocal';
import { eyeFrameOf } from './eyeFrameOf';
import { mappedTiltRad } from './mappedTiltRad';
import { pickOnBody } from './pickOnBody';
import { settledZoomPose } from './settledZoomPose';
import { spentZoomFactor } from './spentZoomFactor';
import { dot3 } from '../math/dot3';
import { normalize3 } from '../math/normalize3';

export function surfaceZoomStep(
  arm: BodyFixedPose,
  gesture: SurfaceGesture | null,
  factor: number,
  cursorPx: Readonly<Vec2> | null,
  viewportPx: Readonly<Vec2>,
  fovYRad: number,
  bodyRadiusM: number,
  sceneUpLocal: Readonly<Vec3>,
  rememberedTiltRad: number,
): BodyFixedPose {
  const latched = gesture?.anchorLocalM ?? null;
  // Past the anchor's own tangent plane the anchor is behind the horizon and
  // zooming toward it is a teleport, so the pick is taken fresh (C §6.7). The
  // test runs every tick rather than latching a flag — the zoom owns no state
  // of its own (FW-B).
  const stale =
    latched !== null && dot3(bodyFixedEyeM(arm), normalize3(latched)) < Math.hypot(...latched);
  // At rest the wheel's own cursor pixel is the pick (user ruling, §12-R4);
  // during a gesture the drag's last pixel is the more current one. Only a
  // pinch supplies neither, and its screen-centre pick is the point C §3.1
  // measures the zoom distance from. Note the two owners differ in anchor
  // LIFETIME by construction: a gesture holds its latch until it goes stale,
  // while at rest every tick re-picks through the same pixel — which converges
  // on the pointed-at ground point rather than drifting off it.
  const pixel: Readonly<Vec2> = gesture?.prevPixel ??
    cursorPx ?? [viewportPx[0] / 2, viewportPx[1] / 2];
  const cursorAnchorM =
    latched !== null && !stale
      ? latched
      : (pickOnBody(cursorRayBodyLocal(arm, pixel, viewportPx, fovYRad), bodyRadiusM)?.pointM ??
        null);
  const stepped = anchoredZoomStep(arm, factor, cursorAnchorM, bodyRadiusM);
  // A dive at the sky has no ground point to converge over and keeps its
  // framing; a dive with one settles about it (pixel-locked). A recession
  // settles about the eye and needs no anchor at all.
  if (factor < 1 && cursorAnchorM === null) return stepped;
  // The pre-notch readout, against the pre-notch reference: the azimuth
  // deviation the recession ride preserves rather than re-authoring, and the
  // tilt deviation from the band mapping (ruling 12) — what the zoom did NOT
  // author, for the capped decay to spend.
  const hrPre = Math.hypot(...bodyFixedEyeM(arm)) / bodyRadiusM - 1;
  const preInBlendFrame = eyeFrameOf(arm, bodyUpWeight(hrPre), sceneUpLocal);
  const preTiltDevRad =
    preInBlendFrame === null
      ? null
      : preInBlendFrame.tiltRad - mappedTiltRad(rememberedTiltRad, hrPre);
  return settledZoomPose(
    stepped,
    factor < 1 ? cursorAnchorM : null,
    bodyRadiusM,
    preTiltDevRad,
    sceneUpLocal,
    preInBlendFrame?.azimuthRad ?? null,
    rememberedTiltRad,
    // Priced in the zoom the step is allowed to SPEND, not the folded notch:
    // `anchoredZoomStep` moves the eye by the same clamped factor.
    Math.abs(Math.log(spentZoomFactor(factor))),
  );
}
