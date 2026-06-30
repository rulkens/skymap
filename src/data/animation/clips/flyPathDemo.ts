/**
 * flyPathDemo — the acceptance proof for the `flyPath` flythrough primitive,
 * shaped like tour stage 03 ("Our neighbourhood"): sweep THROUGH the nearby
 * galaxy groups rather than hopping between them.
 *
 * Hit Play in the debug panel's "Clips & Tours" section (with catalog data
 * linked) to watch the camera bend through the Local Volume groups on one
 * smooth, centripetal Catmull-Rom — no corners, no slingshots, the camera
 * turning to face each group as it approaches.
 *
 * ### What it demonstrates
 *
 *   1. `start: 'live'` — the path flies out of wherever the camera is (the live
 *      pose is the first spline knot), so it works from any framing, and the
 *      aim eases from the live orientation into looking down the path (no pop).
 *
 *   2. Catalog-resolved waypoints — each `atFocus(id)` resolves to a group's
 *      framed position at play time. The camera AIMS along its direction of
 *      travel ("toward the place it's moving to"), so each group grows ahead of
 *      you and slides past.
 *
 *   3. Default align/ramp pacing (`pathDefaults`): the camera turns into the
 *      path as it launches, then a short trapezoidal ease in/out around a long
 *      constant-speed cruise. The ramp reaches zero velocity at both ends, so the
 *      take launches from rest and settles gently on Sculptor — a beat dwell
 *      hands off cleanly. An authored `linger: 0.65` adds a velocity dip at each
 *      group so the camera slows to take it in rather than cruising through.
 *
 * To slow one stretch further, pin a waypoint's `over`; to shape the curve where
 * catalog positions bend it awkwardly, drop a hand-placed `atPoint(world,
 * distance)` control point between two `atFocus` waypoints — the forms interleave
 * freely. The group ids are `${category}-${seedId}` per `resolveFocusId`.
 */

import type { Clip } from '../../../@types/animation/Clip';
import { flyPath, atFocus } from '../../../services/engine/animation/effectHelpers';
import { focusId } from '../../../utils/animation/focusId';

export const flyPathDemo: Clip = {
  id: 'flyPathDemo',
  label: 'Fly-path demo (groups flythrough)',
  data: {
    start: 'live', // the path's first knot is the live camera pose
    timeline: [
      flyPath(
        [
          atFocus(focusId('group-m81-group')), // launch toward M81 group
          atFocus(focusId('group-cen-a-group')), // slow glide past Cen A
          atFocus(focusId('group-sculptor-group')), // settle on Sculptor group
        ],
        { over: 20, linger: 0.65 },
      ),
    ],
  },
};
