/**
 * The edge — the climax and the turnaround point: pull back until the
 * analytic horizon shell holds the whole observable universe in frame. The
 * widest the tour goes, and deliberately the quietest — one slow log-dolly
 * easing to a near-stop, a long still dwell, nothing revealed and nothing
 * named. The shell needs no cue: `horizonShellFadeAlpha` fades it in by
 * camera distance alone (full strength past 40% of its 14,300 Mpc radius,
 * ~5,700 Mpc), so the beat reaches its subject simply by pulling far enough
 * out. The quasar shell from the deep field stays lit and thins into
 * foreground dust against it.
 *
 * No enter clip: the pull IS the beat, so it rides the captioned dwell (the
 * limit-case grammar) — "The edge" lands as the pull begins, and the text
 * sits over the slow widening.
 */

import type { ClipData } from '../../../../@types/animation/ClipData';
import { all, dollyTo, seq, wait } from '../../../../services/engine/animation/effectHelpers';
import { dwellDrift } from '../../../../state/tour/dwellDrift';

// Far enough OUTSIDE the 14,300 Mpc shell that the whole sphere sits in
// frame — the edge seen from without, not from within. Eye-tuned right up
// against the 30,000 Mpc camera ceiling.
const THE_EDGE_MPC = 29229.01;

export const theEdge: ClipData = {
  start: 'live',
  timeline: [
    all([
      // The slowest drift in the tour — at this scale any haste reads as a
      // spin of the whole universe.
      ...dwellDrift(20, { cruiseRate: (Math.PI * 2) / 150 }).timeline,
      seq([wait(1), dollyTo(THE_EDGE_MPC, 10)]),
    ]),
  ],
};
