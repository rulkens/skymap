import type { CameraPose } from './CameraPose';
import type { BodyFixedPose } from './BodyFixedPose';

/** Per-kind pose shape: the world arm stores a `CameraPose`, the body arm a `BodyFixedPose`. */
export type PoseOf = { readonly absolute: CameraPose; readonly body: BodyFixedPose };
