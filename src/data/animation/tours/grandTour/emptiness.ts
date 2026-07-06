/**
 * The emptiness — the third leg of the cosmic-web triad: 05 showed fullness,
 * 06 the currents, and this beat the complement — the voids the matter
 * drains FROM. Turn from the flows' wide landing toward the Boötes void,
 * name it, then dive back down until the dark region fills the frame. The
 * void must read as a dark region OF THE SAME density field, so the volume
 * stays lit; the flow eases out over the turn — it served beat 06, and the
 * emptiness reads cleanest without currents threading through it. The
 * galaxies COME BACK here (the web pull-back stripped them for the pure-
 * volume shot): a void only reads as empty next to fullness, so the
 * catalogs repopulate the web around the dark patch. Scoped survey entries,
 * not the bare row — bare 'survey' would also enable milliquas, which is
 * the deep-field beat's reveal.
 *
 * The stage doc sketched a held-scale lateral slide, but the flows beat now
 * lands at 950 Mpc — so the approach became the same turn-name-fly grammar
 * as M31/Virgo, diving from wide down to the void's framing. The lateral
 * feel survives in the move: Boötes sits in a different part of the sky
 * than Coma, so the target slides across the web as the dolly comes in.
 *
 * focusedOnly flips back ON (one subject again after the flows' label
 * spread), and the void ring category is revealed — the ring-gate rule:
 * without it the focused label would be skipped, and the ring itself is the
 * reassurance that the blank patch is the subject, not a glitch. No strafe
 * on the aim: the old anchor is a volume knot, not a bright sprite.
 */

import type { ClipData } from '../../../../@types/animation/ClipData';
import {
  all,
  dollyToId,
  focus,
  hide,
  hold,
  lookAtId,
  moveTargetId,
  scene,
  show,
} from '../../../../services/engine/animation/effectHelpers';
import { focusId } from '../../../../utils/animation/focusId';
import { setLabelsFocusedOnly } from '../../../../state/settings/settingsSlice';

const BOOTES = focusId('void-bootes-void');

export const emptiness: ClipData = {
  start: 'live',
  timeline: [
    scene(setLabelsFocusedOnly(true)),
    show(['structureRing:void'], 2),
    show(['survey:2mrs', 'survey:sdss', 'survey:glade'], 3),
    hide(['flow'], 3),
    lookAtId(BOOTES, 3),
    focus(BOOTES),
    hold(1),
    all([moveTargetId(BOOTES, 7), dollyToId(BOOTES, 7)]),
  ],
};
