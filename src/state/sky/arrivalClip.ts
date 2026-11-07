/**
 * arrivalClip — the camera clip that stands a person at `spot` (spec §4.3): a glide in the
 * body's fixed frame to the standing pose's own body-arm image over `pointLocalM` (the same
 * `skyPoseToBodyArm` the sky arm folds up through), then a zero-length sky leg at the heading,
 * looking up, which the engine resolves on the live ground at play time (D12). The cut between
 * the two is only that ground's correction from `‖pointLocalM‖`. The glide's angles take the
 * short way round from where the clip's start reads in the same body axes.
 */
import type { CameraArmBasisCtx } from '../../@types/camera/arms/CameraArmBasisCtx';
import type { CameraPose } from '../../@types/camera/pose/CameraPose';
import type { ClipData } from '../../@types/animation/ClipData';
import type { SkySpot } from '../../@types/camera/pose/SkySpot';
import type { Vec3 } from '../../@types/math/Vec3';
import { all, moveTarget, tween } from '../../services/engine/animation/effectHelpers';
import { toBodyFixedChannels } from '../../services/engine/camera/arms/body/toBodyFixedChannels';
import { encodeBodyFixedChannels } from '../../services/engine/camera/arms/body/utils/encodeBodyFixedChannels';
import { skyPoseToBodyArm } from '../../services/engine/camera/arms/sky/utils/skyPoseToBodyArm';
import { SKY_EYE_HEIGHT_M } from '../../services/engine/camera/arms/sky/data/skyEyeHeightM';
import { lerpAngleShortest } from '../../utils/math/lerpAngleShortest';
import { ARRIVAL_GLIDE_SEC } from '../../data/sky/arrivalGlideSec';
import { ARRIVAL_LOOK_UP_RAD } from '../../data/sky/arrivalLookUpRad';

/** `ctx` places the bodies at play time: the glide's start is read in its body's axes once. */
export function arrivalClip(
  start: CameraPose,
  spot: SkySpot,
  pointLocalM: Readonly<Vec3>,
  headingRad: number,
  fovYRad: number,
  ctx: CameraArmBasisCtx,
): ClipData {
  const body = { body: spot.body };
  const look = { azimuthRad: headingRad, altitudeRad: ARRIVAL_LOOK_UP_RAD };
  const stand = skyPoseToBodyArm(look, spot, Math.hypot(...pointLocalM));
  // The eye height as the end range keeps the target beside the ground point it starts on.
  const to = encodeBodyFixedChannels(stand, SKY_EYE_HEIGHT_M);
  const from = toBodyFixedChannels(start, spot.body, ctx.bodies, ctx.poseBasis);
  const over = ARRIVAL_GLIDE_SEC;
  const turn = (ch: 'yaw' | 'roll', a: number, b: number) =>
    tween(ch, { to: lerpAngleShortest(a, b, 1), over, frame: body });
  return {
    start: { ...start, fov: fovYRad },
    timeline: [
      all([
        moveTarget(to.target, over, 'easeInOutCubic', body),
        tween('distance', { to: to.distance, over, frame: body }),
        turn('yaw', from.yaw, to.yaw),
        tween('pitch', { to: to.pitch, over, frame: body }),
        turn('roll', from.roll ?? 0, to.roll ?? 0),
      ]),
      all([
        tween('yaw', { to: headingRad, over: 0, frame: { sky: spot } }),
        tween('pitch', { to: ARRIVAL_LOOK_UP_RAD, over: 0, frame: { sky: spot } }),
      ]),
    ],
  };
}
