/**
 * Our neighbourhood — the one genuinely lateral, grand-tour moment. Sweep
 * PAST six iconic neighbours on one continuous spline — Bode's Galaxy, the
 * Pinwheel, the Whirlpool, the Sombrero, the Southern Pinwheel — settling on
 * Centaurus A, where the caption's two named galaxies bookend the ride.
 *
 * Famous galaxies are discrete subjects with a real pass-by radius, so the
 * flyPath swoops the eye BESIDE each one (4 radii off the outside of the
 * bend) rather than through it — that close swing-past is the whole point of
 * flying galaxies instead of the group volumes this beat used to thread
 * (structures have radius 0 and get flown through-centre, which reads as
 * drifting through empty space).
 *
 * The first knot is Bode's Galaxy because the Andromeda dwell LANDS facing
 * the M81 Group's bearing — the launch continues straight along the aim the
 * viewer already holds, no opening swing. Waypoint order follows the
 * famousFlythrough turn-minimisation insight: the set straddles both
 * celestial hemispheres, so one sharp (~100°) equator crossing is the
 * geometric floor — it lands at the Sombrero, where the banked pass-by turn
 * reads as swinging around the galaxy, not a kink.
 *
 * Label mode flips here: focusedOnly goes OFF so the neighbourhood reads as
 * a populated place — every passed galaxy's name, plus the group labels.
 * That is safe from label flood because structure labels ride their ring
 * category's anchor gate, and the opening strip hid the whole structureRing
 * family: revealing only 'structureRing:group' means only group labels can
 * join. A later beat that wants a single named subject flips the mode back.
 *
 * The final focus() fires on settle — Centaurus A takes the ring emphasis
 * and the recession dims its siblings as the dwell begins. The settle
 * subject is now a bright sprite, so the Virgo beat's aim strafes past it
 * (see approachVirgo).
 */

import type { ClipData } from '../../../../@types/animation/ClipData';
import {
  atFocus,
  flyPath,
  focus,
  scene,
  show,
} from '../../../../services/engine/animation/effectHelpers';
import { focusId } from '../../../../utils/animation/focusId';
import { setLabelsFocusedOnly } from '../../../../state/settings/settingsSlice';

const CEN_A = focusId('c77');

export const neighbourhoodFlythrough: ClipData = {
  start: 'live',
  timeline: [
    // The first real survey reveal rides this beat: 2MRS fades in as the
    // sweep launches, so the neighbourhood is populated with actual galaxies
    // — the famous handful alone would make the ride read as empty space.
    show(['survey:2mrs', 'structureRing:group'], 2),
    scene(setLabelsFocusedOnly(false)),
    flyPath(
      [
        atFocus(focusId('m81')), // Bode's — the bearing the M31 dwell landed on
        atFocus(focusId('m101')), // Pinwheel
        atFocus(focusId('m51')), // Whirlpool
        atFocus(focusId('m104')), // Sombrero — the equator crossing
        atFocus(focusId('m83')), // Southern Pinwheel
        atFocus(CEN_A), // settle
      ],
      // Each galaxy gets a slow-glide linger (lingerSec is wall-clock, never
      // a freeze) so the viewer takes each one in before sweeping on. Spline
      // knobs carry over from the groups version: turnDelay banks late
      // through the bends, the short lookAhead keeps the aim close to each
      // galaxy as it sweeps past.
      {
        over: 26,
        linger: 0.8,
        lingerSec: 2.5,
        spline: { kind: 'causalHermite', turnDelay: 1.7, lookAhead: 0.8 },
      },
    ),
    focus(CEN_A),
  ],
};
