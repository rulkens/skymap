/**
 * famousFlythrough — a curated "grand tour" of iconic famous galaxies, flown as
 * one continuous `flyPath`. Where `flyPathDemo` bends through three nearby galaxy
 * GROUPS, this sweeps PAST eleven individually-famous galaxies on a single smooth
 * spline, settling on the Virgo cluster giant M87. Each galaxy is a discrete
 * subject, so the flyPath pass-by default swoops the eye BESIDE it (4 radii off
 * the outside of the bend) rather than ramming its centre; M87, the destination,
 * is settle-framed. (Groups in `flyPathDemo` are structures → pass-by radius 0 →
 * flown through-centre.)
 *
 * Each waypoint is an `atFocus` addressed by a BARE famous-galaxy seed id (the
 * ids in `data/seeds/famous_galaxies.seed.json`). Bare ids route to the famous
 * resolver in `resolveFocusId`; a `group-`/`cluster-`/`pgc-` prefix would route
 * elsewhere — so famous galaxies stay un-prefixed here.
 *
 * ### Waypoint order is precomputed to minimise turning, not by distance
 *
 * The camera AIMS down its direction of travel (look-ahead), so the camera's
 * look direction IS the path tangent. A sharp turn in the spline therefore
 * whips the gaze around — and an order-by-distance arrangement is full of them,
 * because galaxies at similar distance sit in opposite parts of the sky (a
 * near-180° U-turn from one to the next). So the order below is NOT the seed
 * order: it is the solution to an open-TSP over the galaxies' real 3D positions
 * (RA/Dec/distance → Cartesian, matching `buildFamous`), optimised to minimise
 * the worst turn angle. That roughly halves the total turning and removes the
 * U-turns — the spline reads as one long sweeping arc rather than a zig-zag.
 *
 * The remaining ~100° turn (around M51→Sombrero) is the geometric floor: the set
 * straddles both celestial hemispheres, so at least one equator crossing is
 * unavoidable. Pacing is the flyPath defaults (`pathDefaults`) — a launch-from-
 * rest align-in, a long constant-speed cruise, a gentle settle on M87, plus the
 * default dwell (`linger`/`lingerSec`) so the camera slows on approach to take in
 * each galaxy before sweeping past.
 *
 * To reshape it: add/remove a galaxy then re-run the ordering (the worst turns
 * come from outliers like M87 at 16.8 Mpc — keep those at an endpoint), pin a
 * leg's `over` to dwell, or drop a hand-placed `atPoint(world, distance)` control
 * point to bend a kink. Inspect + replay live via the Clip Path Inspector.
 */

import type { Clip } from '../../../@types/animation/Clip';
import { atFocus, flyPath } from '../../../services/engine/animation/effectHelpers';
import { focusId } from '../../../utils/animation/focusId';

export const famousFlythrough: Clip = {
  id: 'famousFlythrough',
  label: 'Famous galaxies (grand tour)',
  data: {
    start: 'live', // the path's first knot is the live camera pose
    timeline: [
      flyPath(
        [
          atFocus(focusId('c65')), // Sculptor Galaxy
          atFocus(focusId('m31')), // Andromeda
          atFocus(focusId('m101')), // Pinwheel
          atFocus(focusId('m51')), // Whirlpool
          atFocus(focusId('m63')), // Sunflower
          atFocus(focusId('m104')), // Sombrero
          atFocus(focusId('m83')), // Southern Pinwheel
          atFocus(focusId('c77')), // Centaurus A
          atFocus(focusId('m33')), // Triangulum
          atFocus(focusId('m81')), // Bode's Galaxy
          atFocus(focusId('m64')), // Black Eye
          atFocus(focusId('m87')), // Virgo A — settle on the cluster giant
        ],
        { over: 100 },
      ),
    ],
  },
};
