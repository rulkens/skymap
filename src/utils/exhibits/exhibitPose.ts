/**
 * exhibitPose — the pose an exhibit flies to. `fitRadiusMpc` re-derives `distance` against the
 * LIVE lens and aspect, since a static distance cannot fit a sphere at every viewport shape;
 * pre-bootstrap the runtime is null and the authored pose flies instead.
 */

import type { CameraPose } from '../../@types/camera/CameraPose';
import type { Exhibit } from '../../@types/exhibits/Exhibit';
import type { LiveCameraRuntime } from '../../store/types';
import { sphereFitDistance } from '../camera/sphereFitDistance';

export function exhibitPose(
  exhibit: Exhibit,
  rt: Pick<LiveCameraRuntime, 'fovYRad' | 'aspect'> | null,
): CameraPose {
  if (exhibit.fitRadiusMpc === undefined || rt === null) return exhibit.pose;
  return {
    ...exhibit.pose,
    distance: sphereFitDistance(exhibit.fitRadiusMpc, rt.fovYRad, rt.aspect),
  };
}
