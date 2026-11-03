import type { CameraPose } from './CameraPose';
import type { BodyFixedPose } from './BodyFixedPose';
import type { SitePose } from './SitePose';
import type { SkyPose } from './SkyPose';

/** Per-kind pose shape: the world arm stores a `CameraPose`, the body arm a `BodyFixedPose`, a site its turntable, the sky its look. */
export type PoseOf = {
  readonly absolute: CameraPose;
  readonly body: BodyFixedPose;
  readonly site: SitePose;
  readonly sky: SkyPose;
};
