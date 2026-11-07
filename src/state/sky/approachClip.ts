/**
 * approachClip — a far sky entry's first phase (spec §4.3): the flight to straight over the
 * spot, `ARRIVAL_APPROACH_ALT_M` above the body's outer relief bound so no terrain can be in
 * the way, looking down. A zero-length body leg then holds that same sightline in the body's
 * frame, so the view-centre readout (body arms only) can name the real ground under the spot.
 */
import type { CameraArmBasisCtx } from '../../@types/camera/arms/CameraArmBasisCtx';
import type { CameraPose } from '../../@types/camera/pose/CameraPose';
import type { ClipData } from '../../@types/animation/ClipData';
import type { SkySpot } from '../../@types/camera/pose/SkySpot';
import {
  aimAt,
  all,
  geodesic,
  moveTarget,
  tween,
} from '../../services/engine/animation/effectHelpers';
import { hostOrThrow } from '../../services/engine/camera/arms/hostOrThrow';
import { overLonLatPose } from '../../services/engine/camera/framing/overLonLatPose';
import { surfacePointBodyFixed } from '../../utils/geo/surfacePointBodyFixed';
import { radToDeg } from '../../utils/math/radToDeg';
import { DEFAULT_GEODESIC_TUNING } from '../../data/camera/focusMoveDefaults';
import { ARRIVAL_APPROACH_ALT_M } from '../../data/sky/arrivalApproachAltM';
import { ARRIVAL_APPROACH_SEC } from '../../data/sky/arrivalApproachSec';

/** `ctx` places the approach: its bodies are where they will be when the approach ends. */
export function approachClip(
  start: CameraPose,
  spot: SkySpot,
  headingRad: number,
  fovYRad: number,
  ctx: CameraArmBasisCtx,
): ClipData {
  const body = { body: spot.body };
  const host = hostOrThrow(body, ctx);
  const point = { lonDeg: radToDeg(spot.lonRad), latDeg: radToDeg(spot.latRad) };
  const rangeM = host.outerBoundRadiusM - host.radiusM + ARRIVAL_APPROACH_ALT_M;
  const to = overLonLatPose(point, host, rangeM, headingRad, ctx.poseBasis);
  const over = surfacePointBodyFixed(point.latDeg, point.lonDeg, host.outerBoundRadiusM);
  return {
    start: { ...start, fov: fovYRad },
    timeline: [
      all([
        geodesic(to, DEFAULT_GEODESIC_TUNING, fovYRad, ARRIVAL_APPROACH_SEC),
        aimAt({ yaw: to.yaw, pitch: to.pitch }, ARRIVAL_APPROACH_SEC),
        tween('roll', { to: to.roll ?? 0, over: ARRIVAL_APPROACH_SEC }),
      ]),
      all([
        moveTarget(over, 0, 'linear', body),
        tween('distance', { to: ARRIVAL_APPROACH_ALT_M, over: 0, frame: body }),
      ]),
    ],
  };
}
