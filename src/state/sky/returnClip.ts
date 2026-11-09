/**
 * returnClip — Leave's flight from the live camera back to the entry camera, as one leg in
 * the entry camera's own frame, so a body-fixed pose lands where it was on the turning body.
 * A world-frame entry camera came from afar and takes the exhibit fly's dolly-then-reframe.
 * Either way the lens eases from `start.fov` to the entry lens over the whole flight.
 * Channels a frame leaves empty are not authored: the sky tag names the eye, so its `distance`
 * is a zero placeholder log space cannot carry, and only body and world poses carry a roll.
 * A body pose's end is encoded in its own axes: crossing it through heliocentric world
 * coordinates and back costs up to ~6e-10 of basis that varies with the clock.
 */
import type { CameraArmBasisCtx } from '../../@types/camera/arms/CameraArmBasisCtx';
import type { CameraPose } from '../../@types/camera/pose/CameraPose';
import type { ClipData } from '../../@types/animation/ClipData';
import type { Effect } from '../../@types/animation/Effect';
import type { FramedCameraPose } from '../../@types/camera/pose/FramedCameraPose';
import { all, moveTarget, tween } from '../../services/engine/animation/effectHelpers';
import { foldToWorld } from '../../services/engine/camera/arms/foldToWorld';
import { isWorldArm } from '../../services/engine/camera/arms/world/isWorldArm';
import { isBodyArm } from '../../services/engine/camera/arms/body/isBodyArm';
import { encodeBodyFixedChannels } from '../../services/engine/camera/arms/body/utils/encodeBodyFixedChannels';
import { rowFor } from '../../services/engine/camera/arms/rowFor';
import { FLY_TO_POSE_SEC, flyToPoseClip } from '../../data/animation/clips/makers/flyToPoseClip';
import { SKY_RETURN_SEC } from '../../data/sky/skyReturnSec';

export function returnClip(
  start: CameraPose,
  base: FramedCameraPose,
  fovYRad: number,
  ctx: CameraArmBasisCtx,
): ClipData {
  if (isWorldArm(base)) {
    const lens = tween('fov', { to: fovYRad, over: FLY_TO_POSE_SEC, ease: 'easeInOutSine' });
    return { start, timeline: [all([...flyToPoseClip(base.pose).timeline, lens])] };
  }
  const { frame } = base;
  const viaWorld = rowFor(frame).channels.encode(foldToWorld(base, ctx), frame, ctx);
  // The world crossing still names the leg's range: the terrain-aware one `toWorldArm` picks.
  const to = isBodyArm(base) ? encodeBodyFixedChannels(base.pose, viaWorld.distance) : viaWorld;
  const over = SKY_RETURN_SEC;
  const legs: Effect[] = [
    moveTarget(to.target, over, 'easeInOutCubic', frame),
    tween('yaw', { to: to.yaw, over, frame }),
    tween('pitch', { to: to.pitch, over, frame }),
    tween('fov', { to: fovYRad, over }),
  ];
  if (to.distance > 0) legs.push(tween('distance', { to: to.distance, over, frame }));
  if (to.roll !== undefined) legs.push(tween('roll', { to: to.roll, over, frame }));
  return { start, timeline: [all(legs)] };
}
