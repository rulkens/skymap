/** The Observable Universe exhibit's tuned values: the pose. */

import type { CameraPose } from '../../../../@types/camera/pose/CameraPose';

// `distance` is only the pre-runtime fallback (`fitRadiusMpc` re-derives it at fly time): the
// landscape answer at the default 60° FOV (`R / sin(fovY/2)`).
export const POSE: CameraPose = { target: [0, 0, 0], yaw: 0, pitch: 0, distance: 28600 };
