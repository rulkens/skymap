/**
 * flyToPoseClip — a view's pose-addressed establishing move, the sibling of
 * `flyToClip.ts`'s `FocusId`-addressed builder. A focus has no bearing (the
 * camera keeps whatever it had); a view's pose is hand-framed, so yaw/pitch
 * ride along here where `flyToClip` has none.
 *
 * ### Two legs, because `target` cannot move in log space
 *
 * `distance` interpolates logarithmically (`CHANNEL_SPACE`), so a pull-back
 * across eleven decades is perceptually even. `target` is a Vec3 and can only
 * move LINEARLY in world Mpc — log space is undefined for signed values. Run
 * the two in one parallel block and the pivot crosses a hundred Mpc while the
 * eye is still micro-parsecs from it: the world slews past at an absurd rate
 * in the first second and barely moves in the last. `grandTour/cosmicWeb.ts`
 * never does this — it turns, holds, and only then travels, by which point
 * the camera is already out at ~16 Mpc and the pivot move is a few orbit
 * radii rather than a billion. Same phrasing here: pull back to the view's
 * scale first, then move the pivot and settle the bearing, when a hundred Mpc
 * of travel is a fraction of the orbit radius.
 *
 * `easeInOutSine`, not the `easeInOutCubic` default: its peak rate is ~1.57x
 * the mean where cubic's is 2x, so the middle of the pull-back — the part
 * that reads as rushed — is materially gentler for the same duration.
 */

import type { CameraPose } from '../../@types/camera/CameraPose';
import type { ClipData } from '../../@types/animation/ClipData';
import { aimAt, all, dollyTo, moveTarget } from '../../services/engine/animation/effectHelpers';

/** Leg 1: the log pull-back from wherever the viewer was to the view's scale. */
const PULL_BACK_SEC = 6;

/** Leg 2: the pivot slide and bearing settle, both at the view's scale. */
const REFRAME_SEC = 4;

export function flyToPoseClip(pose: CameraPose): ClipData {
  return {
    start: 'live',
    timeline: [
      dollyTo(pose.distance, PULL_BACK_SEC, 'easeInOutSine'),
      all([
        moveTarget(pose.target, REFRAME_SEC, 'easeInOutSine'),
        aimAt({ yaw: pose.yaw, pitch: pose.pitch }, REFRAME_SEC, 'easeInOutSine'),
      ]),
    ],
  };
}
