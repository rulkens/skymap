/**
 * The sky exit's lift (spec §6.1) as a clip in two framed legs, so neither leg
 * interpolates world angles (which roll at the nadir's gimbal point). The sky
 * leg pitches the standing look to the nadir and holds the azimuth; the body
 * leg holds that orientation and moves only the LookAt's target to the ground
 * point and its range to SKY_EXIT_ALTITUDE_M, in linear space, on one ease, so
 * the eye climbs the spot's radial while the lens eases back to the default.
 */

import type { CameraArmCtx } from '../../../../../../@types/camera/arms/CameraArmCtx';
import type { ClipData } from '../../../../../../@types/animation/ClipData';
import type { FramedPose } from '../../../../../../@types/camera/pose/FramedPose';
import type { Vec3 } from '../../../../../../@types/math/Vec3';
import { DEFAULT_FOV_Y_RAD } from '../../../framing/cameraFraming';
import { SKY_EXIT_ALTITUDE_M } from '../data/skyExitAltitudeM';
import { SKY_EXIT_CLIMB_MS } from '../data/skyExitClimbMs';
import { SKY_EXIT_PITCH_MS } from '../data/skyExitPitchMs';
import { all, moveTarget, tween } from '../../../../animation/effectHelpers';
import { foldToWorld } from '../../foldToWorld';
import { hostOrThrow } from '../../hostOrThrow';
import { skySpotRadial } from '../../../../../../utils/geo/skySpotRadial';

export function skyExitLift(framed: FramedPose<'sky'>, ctx: CameraArmCtx): ClipData {
  const host = hostOrThrow(framed.frame, ctx);
  const up = skySpotRadial(framed.frame.sky);
  const groundM = host.groundRadiusAtM(up);
  const ground: Vec3 = [up[0] * groundM, up[1] * groundM, up[2] * groundM];
  const body = { body: host.id };
  const climbSec = SKY_EXIT_CLIMB_MS / 1000;
  return {
    // The start only seeds the sky leg, which opens at once; its lens is the live one.
    start: { ...foldToWorld(framed, ctx), fov: ctx.fovYRad },
    timeline: [
      all([
        // Authored, not left to the leg's converted start, so no round trip nudges it.
        tween('yaw', { to: framed.pose.azimuthRad, over: 0, frame: framed.frame }),
        tween('pitch', { to: -Math.PI / 2, over: SKY_EXIT_PITCH_MS / 1000, frame: framed.frame }),
      ]),
      all([
        moveTarget(ground, climbSec, 'easeInOutCubic', body),
        tween('distance', { to: SKY_EXIT_ALTITUDE_M, over: climbSec, space: 'lin', frame: body }),
        tween('fov', { to: DEFAULT_FOV_Y_RAD, over: climbSec }),
      ]),
    ],
  };
}
