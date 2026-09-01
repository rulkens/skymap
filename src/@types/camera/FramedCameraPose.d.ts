import type { BodyId } from '../data/body/BodyId';
import type { BodyFixedPose } from './BodyFixedPose';
import type { CameraPose } from './CameraPose';

/**
 * The authoritative camera pose and the frame it lives in. The `absolute` arm
 * is today's orbit currency unchanged; the `body` arm is provider B's state.
 * This is the tag-beside-channels form T4 ruled for — NOT the declined
 * FramedPose rewrite of the animation system, which keeps its four channels.
 */
export type FramedCameraPose =
  | { readonly frame: 'absolute'; readonly pose: CameraPose }
  | { readonly frame: { readonly body: BodyId }; readonly pose: BodyFixedPose };
