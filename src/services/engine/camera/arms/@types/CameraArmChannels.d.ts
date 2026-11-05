import type { CameraArmKind } from '../../../../../@types/camera/arms/CameraArmKind';
import type { CameraPose } from '../../../../../@types/camera/pose/CameraPose';
import type { FrameOf } from '../../../../../@types/camera/arms/FrameOf';
import type { FramedPose } from '../../../../../@types/camera/pose/FramedPose';
import type { CameraArmBasisCtx } from '../../../../../@types/camera/arms/CameraArmBasisCtx';

/**
 * One arm's animation-channel pair. `encode` takes WORLD channels rather than
 * a `FramedPose<K>` because a body's four channels keep the AUTHORED target,
 * which the framed pose has already folded into its eye — re-deriving it would
 * move `distance` on every absolute→body leg (prep plan, correction D3).
 */
export type CameraArmChannels<K extends CameraArmKind> = {
  /** Absolute world channels → this arm's channels. */
  encode(world: CameraPose, frame: FrameOf[K], ctx: CameraArmBasisCtx): CameraPose;
  /** This arm's channels → the framed pose they name. */
  decode(channels: CameraPose, frame: FrameOf[K], ctx: CameraArmBasisCtx): FramedPose<K>;
};
