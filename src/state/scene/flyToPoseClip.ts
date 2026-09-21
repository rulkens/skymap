/**
 * flyToPoseClip — builds a camera-only establishing-move clip addressed by a
 * concrete `CameraPose`, the pose-addressed sibling of `flyToClip.ts`'s
 * `FocusId`-addressed builder. A view's pose is already resolved (it comes
 * straight from `viewRegistry`, not a catalog lookup), so this needs no
 * `resolveClipFoci` pass.
 *
 * ### Bearing: yes, `aimAt` is needed
 *
 * `flyToClip` only moves `target`/`distance` — `moveTargetId`/`dollyToId`
 * carry no yaw/pitch arm, because a focus's bearing is whatever the camera
 * already had. A view's pose is hand-framed (e.g. `viewRegistry.cosmicWeb`'s
 * yaw -3.94 / pitch 0.41 was tuned live to compose the cosmic-web volume), so
 * dropping the bearing would land on the right target at the wrong angle — a
 * bug invisible to any test but obvious on screen. `aimAt` is added here.
 */

import type { CameraPose } from '../../@types/camera/CameraPose';
import type { ClipData } from '../../@types/animation/ClipData';
import { aimAt, all, dollyTo, moveTarget } from '../../services/engine/animation/effectHelpers';

/** Duration of the establishing move in seconds — matches `flyToClip.ts`. */
const FLY_SEC = 5;

export function flyToPoseClip(pose: CameraPose): ClipData {
  return {
    start: 'live',
    timeline: [
      all([
        moveTarget(pose.target, FLY_SEC, 'easeInOutCubic'),
        dollyTo(pose.distance, FLY_SEC, 'easeInOutCubic'),
        aimAt({ yaw: pose.yaw, pitch: pose.pitch }, FLY_SEC, 'easeInOutCubic'),
      ]),
    ],
  };
}
