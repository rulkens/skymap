import type { BodyId } from '../data/body/BodyId';
import type { BodyFixedPose } from './BodyFixedPose';
import type { CameraPose } from './CameraPose';

/**
 * The authoritative camera pose and the frame it lives in, in the
 * tag-beside-channels form ruled for by T4 — the animation system is NOT
 * framed this way and keeps its own four channels.
 */
export type FramedCameraPose =
  | { readonly frame: 'absolute'; readonly pose: CameraPose }
  | { readonly frame: { readonly body: BodyId }; readonly pose: BodyFixedPose };
