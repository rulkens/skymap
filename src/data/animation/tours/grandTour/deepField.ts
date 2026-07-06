/**
 * The deep field — push past the local universe: everything the tour has
 * visited collapses to a glowing core while the quasar shell emerges around
 * it, light already billions of years old. The subject is the DEPTH itself,
 * so there is nothing to focus and nothing to name — the enter clears the
 * void focus, drops the structure rings (annotations of scales now shrinking
 * to a dot), and slides the orbit target home to the ORIGIN as an arbitrary
 * point: at this scale no single object frames the shot, home is just the
 * centre the universe recedes from.
 *
 * The big log-dolly is the beat, so it rides the captioned DWELL (the
 * neighbourhood/flows lesson): the enter is only the turn home, the caption
 * lands, and then the pull runs under the text — ~150 → 2,000 Mpc in one
 * continuous move with a short breath at depth. The milliquas reveal fires
 * with the enter so the shell is fading up as the pull begins; the surveys
 * from the web section stay lit and become the core's glow.
 */

import type { ClipData } from '../../../../@types/animation/ClipData';
import type { Vec3 } from '../../../../@types/math/Vec3';
import {
  all,
  dollyTo,
  focus,
  hide,
  moveTarget,
  seq,
  show,
  wait,
} from '../../../../services/engine/animation/effectHelpers';
import { dwellDrift } from '../../../../state/tour/dwellDrift';

const ORIGIN: Vec3 = [0, 0, 0];

// The pull's landing — deep enough that the quasar shell dominates and the
// local web reads as a core. Eye-tuned against the milliquas density.
const DEEP_FIELD_MPC = 2500;

export const deepField: ClipData = {
  start: 'live',
  timeline: [
    focus(null),
    hide(['structureRing:void', 'structureRing:supercluster'], 2),
    show(['survey:milliquas'], 6),
    // Track the orbit target home — the eye swings from the Boötes framing
    // to sit ~150 Mpc from the origin, looking at everything we've visited.
    moveTarget(ORIGIN, 4),
  ],
};

/**
 * The dwell: the pull itself, captioned. A slow drift rides under the dolly
 * for parallax; the dolly is log-space (the distance channel's native
 * interpolation), so the decade from 150 to 2,000 Mpc runs at a constant
 * felt speed. A short breath at depth, then the auto-advance cuts.
 */
export const deepFieldDwell: ClipData = {
  start: 'live',
  timeline: [
    all([
      ...dwellDrift(14, { cruiseRate: (Math.PI * 2) / 90 }).timeline,
      seq([wait(1), dollyTo(DEEP_FIELD_MPC, 9)]),
    ]),
  ],
};
