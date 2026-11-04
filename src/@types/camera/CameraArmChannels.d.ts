import type { CameraArmKind } from './CameraArmKind';
import type { CameraPose } from './CameraPose';
import type { FrameOf } from './FrameOf';
import type { FramedPose } from './FramedPose';
import type { CameraArmBasisCtx } from './CameraArmBasisCtx';

/**
 * One rung's animation-channel pair. `encode` takes WORLD channels rather than
 * a `FramedPose<K>` because a body's four channels keep the AUTHORED target,
 * which the framed pose has already folded into its eye — re-deriving it would
 * move `distance` on every absolute→body leg (prep plan, correction D3).
 */
export type CameraArmChannels<K extends CameraArmKind> = {
  /** Absolute world channels → this rung's channels. */
  encode(world: CameraPose, frame: FrameOf[K], ctx: CameraArmBasisCtx): CameraPose;
  /** This rung's channels → the framed pose they name. */
  decode(channels: CameraPose, frame: FrameOf[K], ctx: CameraArmBasisCtx): FramedPose<K>;
};
