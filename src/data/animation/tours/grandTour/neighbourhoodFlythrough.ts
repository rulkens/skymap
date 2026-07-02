/**
 * Our neighbourhood — the one genuinely lateral, grand-tour moment. Sweep
 * THROUGH the local galaxy groups rather than hopping between them: the path
 * bends through the M81 and Centaurus A groups at cruise speed (linger 0 —
 * they shape the curve, they are not stops) and settles on the Sculptor
 * Group, where the caption lands.
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
    show(['structureRing:group'], 1),
    scene(setLabelsFocusedOnly(false)),
    flyPath(
      [
        atFocus(M81_GROUP, { linger: 0 }), // launch toward M81 — pass through
        atFocus(CEN_A_GROUP, { linger: 0 }), // bend past Cen A — pass through
        atFocus(SCULPTOR_GROUP), // settle: default linger takes it in
      ],
      // The settle dwell: full-depth linger (a ~12%-speed crawl, never a
      // freeze) over a wide window, so the camera glides into Sculptor and
      // takes it in before the beat dwell hands over. Only the settle knot
      // feels these — the pass-throughs pin linger: 0 above.
      { over: 18, linger: 1, lingerSec: 3 },
    ),
    focus(SCULPTOR_GROUP),
  ],
};
