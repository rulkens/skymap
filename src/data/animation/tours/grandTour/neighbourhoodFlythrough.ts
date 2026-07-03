/**
 * Our neighbourhood — the one genuinely lateral, grand-tour moment. Sweep
 * THROUGH the local galaxy groups rather than hopping between them: the path
 * bends through the M81 and Centaurus A groups, slowing to take each one in,
 * and settles on the Sculptor Group, where the caption lands.
 *
 * Label mode flips here: focusedOnly goes OFF so the neighbourhood reads as
 * a populated place — every group's name, plus the nearby famous galaxies'.
 * That is safe from label flood because structure labels ride their ring
 * category's anchor gate, and the opening strip hid the whole structureRing
 * family: revealing only 'structureRing:group' means only group labels can
 * join. A later beat that wants a single named subject flips the mode back.
 *
 * The final focus() fires on settle — Sculptor takes the ring emphasis and
 * the recession dims its siblings as the dwell begins.
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

const M81_GROUP = focusId('group-m81-group');
const CEN_A_GROUP = focusId('group-cen-a-group');
const SCULPTOR_GROUP = focusId('group-sculptor-group');

export const neighbourhoodFlythrough: ClipData = {
  start: 'live',
  timeline: [
    // The first real survey reveal rides this beat: 2MRS fades in as the
    // sweep launches, so the neighbourhood is populated with actual galaxies
    // — the famous handful alone would make the groups read as empty rings.
    show(['survey:2mrs', 'structureRing:group'], 2),
    scene(setLabelsFocusedOnly(false)),
    flyPath(
      [
        atFocus(M81_GROUP), // launch toward M81
        atFocus(CEN_A_GROUP), // bend past Cen A
        atFocus(SCULPTOR_GROUP), // settle
      ],
      // Every group gets a 3-second linger (a slow glide, never a freeze —
      // lingerSec is wall-clock): the sweep decelerates into each knot so
      // the viewer takes each group in, then cruises on, settling on
      // Sculptor before the beat dwell hands over. The spline is hand-tuned
      // off the defaults: a longer turnDelay banks later through the bends,
      // a shorter lookAhead keeps the aim closer to the groups as they
      // sweep past.
      {
        over: 18,
        linger: 0.8,
        lingerSec: 3,
        spline: { kind: 'causalHermite', turnDelay: 1.7, lookAhead: 0.8 },
      },
    ),
    focus(SCULPTOR_GROUP),
  ],
};
