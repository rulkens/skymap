/**
 * Our neighbourhood — the pull-back reveal between the Local-Group close-up
 * and the flythrough: dolly out from the family until the surrounding
 * groups and the 2MRS field make it one small clump among many.
 *
 * This clip is the beat's DWELL and the beat has no enter clip — the
 * caption is ABOUT the widening view, so it must ride the motion (captions
 * reveal on dwell start; an enter clip would play the pull-back wordless).
 * Same pattern as the flythrough after it.
 *
 * The scene needs no cues: 2MRS, the group rings, and the focusedOnly-off
 * label mode all arrived with the Local-Group beat, and the Local Group
 * stays focused — its ring + label shrink into the field as the camera
 * recedes, which IS the beat's point ("that circle is where you live").
 *
 * The drift continues the revolution the Local-Group dwell began: the two
 * dwells share one full backward orbit that lands facing the M81 Group
 * (the flythrough's first knot). This beat owns its share — a gentle
 * default-rate drift over its window, exported so the Local-Group dwell
 * can take exactly the remainder. Tuning this beat's length or rate
 * automatically rebalances the earlier dwell; the landing bearing is the
 * invariant, the split is not.
 */

import type { ClipData } from '../../../../@types/animation/ClipData';
import { all, dollyTo, seq, wait } from '../../../../services/engine/animation/effectHelpers';
import { dwellDrift } from '../../../../state/tour/dwellDrift';

export const REVEAL_DWELL_SEC = 12;
// The default dwellDrift rate, negated to keep the shared orbit's backward
// spin. Exported (with the duration) for the Local-Group dwell's remainder.
export const REVEAL_NET_YAW_RAD = -((Math.PI * 2) / 45) * REVEAL_DWELL_SEC;

// Where the pull-out lands: wide enough that the neighbouring groups' scale
// reads (the flythrough's subjects sit ~3.5 Mpc out), eye-tuned from there.
const NEIGHBOURHOOD_MPC = 4.5;

export const neighbourhoodReveal: ClipData = {
  start: 'live',
  timeline: [
    all([
      ...dwellDrift(REVEAL_DWELL_SEC, { cruiseRate: REVEAL_NET_YAW_RAD / REVEAL_DWELL_SEC })
        .timeline,
      // A beat of stillness, then the pull; the drift outlasts the dolly so
      // the wide shot breathes before the flythrough launches.
      seq([wait(1), dollyTo(NEIGHBOURHOOD_MPC, 9)]),
    ]),
  ],
};
