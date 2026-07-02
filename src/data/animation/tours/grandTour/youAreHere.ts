/**
 * You are here — the previous beat already framed the Milky Way, so there is
 * no camera move: the only cue is naming the subject. A show() is a point
 * cue with zero awaited duration, so the clip lands on its arrival frame and
 * the caption reveals at once — the dwell drift carries the local orbit.
 *
 * The Milky Way has been the FOCUSED subject since beat 1, so under the
 * tour's focusedOnly label mode this layer reveal is the second of the two
 * gates — the label appears exactly when this cue fires, not earlier.
 */

import type { ClipData } from '../../../../@types/animation/ClipData';
import { show } from '../../../../services/engine/animation/effectHelpers';

export const youAreHere: ClipData = {
  start: 'live',
  timeline: [show(['label:milkyWay'], 1)],
};
