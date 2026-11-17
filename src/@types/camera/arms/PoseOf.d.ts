import type { CameraPose } from '../pose/CameraPose';
import type { BodyFixedPose } from '../pose/BodyFixedPose';
import type { SitePose } from '../pose/SitePose';
import type { SkyPose } from '../pose/SkyPose';

/** Per-kind pose shape: the world arm stores a `CameraPose`, the body arm a `BodyFixedPose`, a site its turntable, the sky its look. */
export type PoseOf = {
  readonly absolute: CameraPose;
  readonly body: BodyFixedPose;
  readonly site: SitePose;
  readonly sky: SkyPose;
};
