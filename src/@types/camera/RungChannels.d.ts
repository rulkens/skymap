import type { RungKind } from './RungKind';
import type { CameraPose } from './CameraPose';
import type { FrameOf } from './FrameOf';
import type { FramedPose } from './FramedPose';
import type { RungBasisCtx } from './RungBasisCtx';

/**
 * One rung's animation-channel pair. `encode` takes WORLD channels rather than
 * a `FramedPose<K>` because a body's four channels keep the AUTHORED target,
 * which the framed pose has already folded into its eye — re-deriving it would
 * move `distance` on every absolute→body leg (prep plan, correction D3).
 */
export type RungChannels<K extends RungKind> = {
  /** Absolute world channels → this rung's channels. */
  encode(world: CameraPose, frame: FrameOf[K], ctx: RungBasisCtx): CameraPose;
  /** This rung's channels → the framed pose they name. */
  decode(channels: CameraPose, frame: FrameOf[K], ctx: RungBasisCtx): FramedPose<K>;
};
