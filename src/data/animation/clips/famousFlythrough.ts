/**
 * famousFlythrough — a curated "grand tour" of a dozen iconic famous galaxies,
 * flown as one continuous `flyPath`. Where `flyPathDemo` bends through three
 * nearby galaxy GROUPS, this sweeps THROUGH twelve individually-famous galaxies,
 * ordered as an outward journey: from the Local Group's Andromeda out to the
 * Virgo cluster's M87.
 *
 * Each waypoint is an `atFocus` addressed by a BARE famous-galaxy seed id (the
 * ids in `data/seeds/famous_galaxies.seed.json`). Bare ids route to the famous
 * resolver in `resolveFocusId`; a `group-`/`cluster-`/`pgc-` prefix would route
 * elsewhere — so famous galaxies stay un-prefixed here.
 *
 * The ordering is roughly monotonic in distance, so the centripetal Catmull-Rom
 * reads as a steady push outward rather than a zig-zag. The camera AIMS down its
 * direction of travel (look-ahead), so each galaxy grows ahead of you and slides
 * past as the next one swings into frame. Pacing is the flyPath defaults
 * (`pathDefaults`): a launch-from-rest align-in, a long constant-speed cruise,
 * and a gentle settle on M87.
 *
 * To reshape it, reorder the waypoints, pin a leg's `over` to dwell on a galaxy,
 * or drop a hand-placed `atPoint(world, distance)` control point between two
 * `atFocus` waypoints to bend the curve where catalog positions kink it. Inspect
 * + replay it live via the debug panel's Clip Path Inspector.
 */

import type { Clip } from '../../../@types/animation/Clip';
import { flyPath, atFocus } from '../../../services/engine/animation/effectHelpers';
import { focusId } from '../../../utils/animation/focusId';

export const famousFlythrough: Clip = {
  id: 'famousFlythrough',
  label: 'Famous galaxies (grand tour)',
  data: {
    start: 'live', // the path's first knot is the live camera pose
    timeline: [
      flyPath(
        [
          atFocus(focusId('m31')), // Andromeda — the nearest large spiral
          atFocus(focusId('m33')), // Triangulum
          atFocus(focusId('m81')), // Bode's Galaxy
          atFocus(focusId('m82')), // Cigar — a close pass beside M81
          atFocus(focusId('c77')), // Centaurus A
          atFocus(focusId('c65')), // Sculptor Galaxy
          atFocus(focusId('m83')), // Southern Pinwheel
          atFocus(focusId('m64')), // Black Eye
          atFocus(focusId('m101')), // Pinwheel
          atFocus(focusId('m51')), // Whirlpool
          atFocus(focusId('m104')), // Sombrero
          atFocus(focusId('m87')), // Virgo A — settle on the cluster giant
        ],
        { over: 60 },
      ),
    ],
  },
};
