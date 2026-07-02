/**
 * You are here — the previous beat already framed the Milky Way, so there is
 * no camera move: the only cue is naming the subject. A show() is a point
 * cue with zero awaited duration, so the clip lands on its arrival frame and
 * the caption reveals at once — the dwell carries all the motion.
 *
 * The Milky Way has been the FOCUSED subject since beat 1, so under the
 * tour's focusedOnly label mode this layer reveal is the second of the two
 * gates — the label appears exactly when this cue fires, not earlier.
 *
 * The dwell is the default drift PLUS a push-in: the title beat holds at the
 * framing distance (0.15 Mpc), so dollying closer here makes this beat read
 * as its own move — leaning in to look at home — rather than a caption swap
 * on the same shot. The dolly rides inside the drift's `all`, parallel with
 * the orbit; it writes `distance` while the drift writes yaw/pitch, so the
 * single-writer rule holds.
 */

import type { ClipData } from '../../../../@types/animation/ClipData';
import { all, dollyTo, show } from '../../../../services/engine/animation/effectHelpers';
import { dwellDrift } from '../../../../state/tour/dwellDrift';

export const youAreHere: ClipData = {
  start: 'live',
  timeline: [show(['label:milkyWay'], 1)],
};

export const youAreHereDwell: ClipData = {
  start: 'live',
  timeline: [all([...dwellDrift(7).timeline, dollyTo(0.08, 4)])],
};
