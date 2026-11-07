/**
 * arrivalClip — the camera clip that stands a person at `spot` (spec §4.3). A glide in the
 * body's fixed frame keeps the view's own orientation while the target slides to the ground
 * point and the range closes; a zero-length sky leg then stands at `headingRad`, looking up,
 * on the live ground the engine resolves at play time (D12). A far entry (no ground point)
 * first flies to straight over the spot, centre-looking, then snaps target and range along
 * that one sightline so the glide descends the radial instead of cutting through the body.
 */
import type { CameraArmBasisCtx } from '../../@types/camera/arms/CameraArmBasisCtx';
import type { CameraPose } from '../../@types/camera/pose/CameraPose';
import type { ClipData } from '../../@types/animation/ClipData';
import type { Effect } from '../../@types/animation/Effect';
import type { SkySpot } from '../../@types/camera/pose/SkySpot';
import type { Vec3 } from '../../@types/math/Vec3';
import {
  aimAt,
  all,
  geodesic,
  moveTarget,
  tween,
} from '../../services/engine/animation/effectHelpers';
import { toWorldArm } from '../../services/engine/camera/arms/body/poseFrameConversion';
import { hostOrThrow } from '../../services/engine/camera/arms/hostOrThrow';
import { lonLatFocusPose } from '../../utils/camera/arms/lonLatFocusPose';
import { centreLookingArm } from '../../utils/camera/arms/centreLookingArm';
import { eyeMpcOf } from '../../utils/camera/orbitPose/eyeMpcOf';
import { skySpotRadial } from '../../utils/geo/skySpotRadial';
import { radToDeg } from '../../utils/math/radToDeg';
import { DEFAULT_GEODESIC_TUNING } from '../../data/camera/focusMoveDefaults';
import { ARRIVAL_APPROACH_ALT_M } from '../../data/sky/arrivalApproachAltM';
import { ARRIVAL_APPROACH_SEC } from '../../data/sky/arrivalApproachSec';
import { ARRIVAL_END_RANGE_M } from '../../data/sky/arrivalEndRangeM';
import { ARRIVAL_GLIDE_SEC } from '../../data/sky/arrivalGlideSec';
import { ARRIVAL_LOOK_UP_RAD } from '../../data/sky/arrivalLookUpRad';

/** `ctx` places the approach: its bodies are where they will be when the approach ends. */
export function arrivalClip(
  start: CameraPose,
  spot: SkySpot,
  pointLocalM: Vec3 | null,
  headingRad: number,
  fovYRad: number,
  ctx: CameraArmBasisCtx,
): ClipData {
  const body = { body: spot.body };
  const up = skySpotRadial(spot);
  const host = hostOrThrow(body, ctx);
  const ground: Vec3 = pointLocalM ?? [
    up[0] * host.radiusM,
    up[1] * host.radiusM,
    up[2] * host.radiusM,
  ];
  const approach: Effect[] = [];
  if (pointLocalM === null) {
    const over = lonLatFocusPose(
      { lonDeg: radToDeg(spot.lonRad), latDeg: radToDeg(spot.latRad) },
      spot.body,
      host.radiusM,
      ARRIVAL_APPROACH_ALT_M,
      headingRad,
    );
    const world = toWorldArm(
      over,
      host.state,
      ctx.poseBasis,
      ctx.upBasis,
      host.radiusM,
      host.standoffRadii,
      host.groundRadiusAtM,
    );
    const to = centreLookingArm(
      eyeMpcOf(world, ctx.poseBasis),
      host.state.positionMpc,
      ctx.poseBasis,
      world.roll ?? 0,
    ).pose;
    approach.push(
      all([
        geodesic(to, DEFAULT_GEODESIC_TUNING, fovYRad, ARRIVAL_APPROACH_SEC),
        aimAt({ yaw: to.yaw, pitch: to.pitch }, ARRIVAL_APPROACH_SEC),
        tween('roll', { to: to.roll ?? 0, over: ARRIVAL_APPROACH_SEC }),
      ]),
      all([
        moveTarget(ground, 0, 'linear', body),
        tween('distance', { to: ARRIVAL_APPROACH_ALT_M, over: 0, frame: body }),
      ]),
    );
  }
  return {
    start: { ...start, fov: fovYRad },
    timeline: [
      ...approach,
      all([
        moveTarget(ground, ARRIVAL_GLIDE_SEC, 'easeInOutCubic', body),
        tween('distance', { to: ARRIVAL_END_RANGE_M, over: ARRIVAL_GLIDE_SEC, frame: body }),
      ]),
      all([
        tween('yaw', { to: headingRad, over: 0, frame: { sky: spot } }),
        tween('pitch', { to: ARRIVAL_LOOK_UP_RAD, over: 0, frame: { sky: spot } }),
      ]),
    ],
  };
}
