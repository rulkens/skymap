/**
 * flyToPoseClip — an exhibit's pose-addressed establishing move, the sibling
 * of `flyToClip.ts`'s `FocusId`-addressed builder. A focus has no bearing (the
 * camera keeps whatever it had); an exhibit's pose is hand-framed, so
 * yaw/pitch ride along here where `flyToClip` has none.
 *
 * ### Two legs, because `target` cannot move in log space
 *
 * `distance` interpolates logarithmically (`CHANNEL_SPACE`), so a pull-back
 * across seventeen decades is perceptually even. `target` is a Vec3 and can
 * only move LINEARLY in world Mpc — log space is undefined for signed values.
 * Run the two in one parallel block and the pivot crosses a hundred Mpc while
 * the eye is still micro-parsecs from it: the world slews past at an absurd
 * rate in the first second and barely moves in the last.
 * `grandTour/cosmicWeb.ts` never does this — it turns, holds, and only then
 * travels, by which point the camera is already far out and the pivot move is
 * a few orbit radii rather than a billion.
 *
 * ### Why the legs overlap, and by how little
 *
 * Two legs butted end to end meet at zero velocity — the dolly eases out, the
 * pivot eases in, and the join reads as a stall. Overlapping them fixes that,
 * but only barely: the pull-back's distance grows EXPONENTIALLY in eased
 * time, so the pivot's angular rate (travel over distance) explodes if it
 * starts early. From the boot home at Earth (~1e-15 Mpc) to the Cosmic Web's
 * 251 Mpc the ramp spans ~17.6 decades, and the camera is still inside the
 * Galaxy at 80% of it. At `REFRAME_JOIN` the camera is out past ~30 Mpc and
 * the pivot's opening degrees cost ~0.1 rad/s; a tenth earlier they cost
 * 0.5 rad/s and the field lurches. So the overlap is the dolly's last sixth:
 * enough that its tail covers the pivot's slow start, not enough to slew.
 *
 * `easeInOutSine`, not the `easeInOutCubic` default: its peak rate is ~1.57x
 * the mean where cubic's is 2x, so the middle of the pull-back — the part
 * that reads as rushed — is materially gentler for the same duration.
 */

import type { CameraPose } from '../../../../@types/camera/CameraPose';
import type { ClipData } from '../../../../@types/animation/ClipData';
import {
  aimAt,
  all,
  dollyTo,
  moveTarget,
  seq,
  wait,
} from '../../../../services/engine/animation/effectHelpers';

/** Leg 1: the log pull-back from wherever the viewer was to the exhibit's scale. */
const PULL_BACK_SEC = 7;

/** Leg 2: the pivot slide and bearing settle, mostly at the exhibit's scale. */
const REFRAME_SEC = 5;

/** Where leg 2 joins leg 1, as a fraction of the pull-back — see the header. */
const REFRAME_JOIN = 0.85;

/**
 * The whole fly, in seconds. Leg 2 outlasts leg 1, so it sets the end — the
 * exhibit's copy waits on this (`ExhibitOverlayContainer`).
 */
export const FLY_TO_POSE_SEC = PULL_BACK_SEC * REFRAME_JOIN + REFRAME_SEC;

export function flyToPoseClip(pose: CameraPose): ClipData {
  return {
    start: 'live',
    timeline: [
      all([
        dollyTo(pose.distance, PULL_BACK_SEC, 'easeInOutSine'),
        seq([
          wait(PULL_BACK_SEC * REFRAME_JOIN),
          all([
            moveTarget(pose.target, REFRAME_SEC, 'easeInOutSine'),
            aimAt({ yaw: pose.yaw, pitch: pose.pitch }, REFRAME_SEC, 'easeInOutSine'),
          ]),
        ]),
      ]),
    ],
  };
}
