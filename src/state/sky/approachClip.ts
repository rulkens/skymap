/**
 * approachClip — a far sky entry's first phase (spec §4.3): the flight to straight over the
 * spot, `ARRIVAL_APPROACH_ALT_M` above the body's outer relief bound so no terrain can be in
 * the way, looking down. It ends in the world frame: the geodesic is a composite, which no
 * body-framed leg may follow (`validateCompositeExclusivity`). None is needed, since the
 * fold engages the body arm on the way down (focus is the spot's body), and the view-centre
 * readout (body arms only) then names the real ground under the spot.
 */
import type { CameraArmBasisCtx } from '../../@types/camera/arms/CameraArmBasisCtx';
import type { CameraPose } from '../../@types/camera/pose/CameraPose';
import type { ClipData } from '../../@types/animation/ClipData';
import type { SkySpot } from '../../@types/camera/pose/SkySpot';
import { aimAt, all, geodesic, tween } from '../../services/engine/animation/effectHelpers';
import { hostOrThrow } from '../../services/engine/camera/arms/hostOrThrow';
import { overLonLatPose } from '../../services/engine/camera/framing/overLonLatPose';
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
  const host = hostOrThrow({ body: spot.body }, ctx);
  const point = { lonDeg: radToDeg(spot.lonRad), latDeg: radToDeg(spot.latRad) };
  const rangeM = host.outerBoundRadiusM - host.radiusM + ARRIVAL_APPROACH_ALT_M;
  const to = overLonLatPose(point, host, rangeM, headingRad, ctx.poseBasis);
  return {
    start: { ...start, fov: fovYRad },
    timeline: [
      all([
        geodesic(to, DEFAULT_GEODESIC_TUNING, fovYRad, ARRIVAL_APPROACH_SEC),
        aimAt({ yaw: to.yaw, pitch: to.pitch }, ARRIVAL_APPROACH_SEC),
        tween('roll', { to: to.roll ?? 0, over: ARRIVAL_APPROACH_SEC }),
      ]),
    ],
  };
}
