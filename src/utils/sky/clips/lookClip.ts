/**
 * lookClip — a standing search's head turn: yaw, pitch and lens legs in the spot's sky frame.
 * The yaw leg opens on `start` read in that frame and lerps plainly, so the shortest turn is
 * measured from that same reading. A target below the horizon gets the horizon look and no
 * lens leg.
 */
import type { CameraArmBasisCtx } from '../../../@types/camera/arms/CameraArmBasisCtx';
import type { CameraPose } from '../../../@types/camera/pose/CameraPose';
import type { ClipData } from '../../../@types/animation/ClipData';
import type { Effect } from '../../../@types/animation/Effect';
import type { SkyLook } from '../../../@types/sky/SkyLook';
import type { SkySpot } from '../../../@types/camera/pose/SkySpot';
import { all, tween } from '../../../services/engine/animation/effectHelpers';
import { rowFor } from '../../../services/engine/camera/arms/rowFor';
import { wrapRad } from '../../math/wrapRad';
import { SKY_BELOW_HORIZON_LOOK_RAD } from '../../../data/sky/skyBelowHorizonLookRad';
import { SKY_LOOK_SEC } from '../../../data/sky/skyLookSec';

export function lookClip(
  start: CameraPose,
  fovYRad: number,
  look: SkyLook,
  spot: SkySpot,
  ctx: CameraArmBasisCtx,
): ClipData {
  const frame = { sky: spot };
  const fromYaw = rowFor(frame).channels.encode(start, frame, ctx).yaw;
  const over = SKY_LOOK_SEC;
  const legs: Effect[] = [
    tween('yaw', { to: fromYaw + wrapRad(look.azimuthRad - fromYaw), over, frame }),
    tween('pitch', {
      to: look.kind === 'look' ? look.altitudeRad : SKY_BELOW_HORIZON_LOOK_RAD,
      over,
      frame,
    }),
  ];
  if (look.kind === 'look') legs.push(tween('fov', { to: look.fovYRad, over }));
  return { start: { ...start, fov: fovYRad }, timeline: [all(legs)] };
}
