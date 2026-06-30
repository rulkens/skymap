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
 *   3. A pinned slow leg — the leg into Centaurus A pins `over: 5`, so the
 *      camera decelerates to a slow glide through that stretch ("watch the
 *      view") and accelerates away WITHOUT stopping. The unpinned legs split the
 *      remaining time by arc-length share (uniform speed).
 *
 *   4. Global `ease: 'inOut'` — the whole take launches from rest and settles
 *      gently on Sculptor, independent of the internal speed structure. The
 *      settle arrives at zero velocity, so a beat dwell would hand off cleanly.
 *
 * To shape the curve where catalog positions alone bend it awkwardly, drop a
 * hand-placed `atPoint(world, distance)` control point between two `atFocus`
 * waypoints — the two forms interleave freely. The group ids are
 * `${category}-${seedId}` per `resolveFocusId`.
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
        { over: 20, ease: 'inOut' },
      ),
    ],
  },
};
