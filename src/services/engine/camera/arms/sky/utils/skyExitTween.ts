/**
 * The sky exit's lift (spec §6.3): from the live world pose to SKY_EXIT_ALTITUDE_M
 * above the spot's ground point, looking straight down with the sky azimuth as
 * the map's heading (tilt 0 puts screen-up along it), easing the lens back to
 * the default. Both ends are world poses through `ctx.poseBasis`, so the drain
 * stamps the orientation they were captured under as the tween's `frame`.
 */

import type { CameraArmCtx } from '../../../../../../@types/camera/arms/CameraArmCtx';
import type { CameraTweenDescriptor } from '../../../../../../@types/camera/focusMotion/CameraTweenDescriptor';
import type { FramedPose } from '../../../../../../@types/camera/pose/FramedPose';
import type { Vec3 } from '../../../../../../@types/math/Vec3';
import { DEFAULT_FOV_Y_RAD } from '../../../framing/cameraFraming';
import { SKY_EXIT_ALTITUDE_M } from '../data/skyExitAltitudeM';
import { SKY_EXIT_DURATION_MS } from '../data/skyExitDurationMs';
import { foldToWorld } from '../../foldToWorld';
import { hostOrThrow } from '../../hostOrThrow';
import { skyPoseToBodyArm } from './skyPoseToBodyArm';
import { skySpotRadial } from '../../../../../../utils/geo/skySpotRadial';

export function skyExitTween(
  framed: FramedPose<'sky'>,
  ctx: CameraArmCtx,
): Omit<CameraTweenDescriptor, 'frame'> {
  const host = hostOrThrow(framed.frame, ctx);
  const spot = framed.frame.sky;
  const up = skySpotRadial(spot);
  const lookingDown = skyPoseToBodyArm(
    { azimuthRad: framed.pose.azimuthRad, altitudeRad: -Math.PI / 2 },
    spot,
    host.groundRadiusAtM(up),
  );
  const eyeRelAnchorM: Vec3 = [
    up[0] * SKY_EXIT_ALTITUDE_M,
    up[1] * SKY_EXIT_ALTITUDE_M,
    up[2] * SKY_EXIT_ALTITUDE_M,
  ];
  return {
    from: foldToWorld(framed, ctx),
    to: foldToWorld({ frame: { body: host.id }, pose: { ...lookingDown, eyeRelAnchorM } }, ctx),
    motion: { style: 'eased', durationMs: SKY_EXIT_DURATION_MS, ease: 'easeInOutCubic' },
    // The push only fills at the widest lens, so this is LENS_MAX.
    fovYRad: { from: ctx.fovYRad, to: DEFAULT_FOV_Y_RAD },
  };
}
