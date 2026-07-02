/**
 * Nearest neighbour — the first rung of the ladder. Reveal the famous
 * galaxies (hidden by the opening strip), turn the view until Andromeda
 * drifts to centre frame, name it, breathe, then fly out to it.
 *
 * `focusOn` is deliberately decomposed here: the `focus()` cue fires between
 * the aim and the fly, so under the tour's focusedOnly label mode Andromeda's
 * name appears the moment it centres — the viewer reads WHERE they are about
 * to go before the camera commits.
 */

import type { ClipData } from '../../../../@types/animation/ClipData';
import {
  all,
  dollyToId,
  focus,
  hold,
  lookAt,
  moveTargetId,
  show,
} from '../../../../services/engine/animation/effectHelpers';
import { focusId } from '../../../../utils/animation/focusId';

const M31 = focusId('m31');

export const approachM31: ClipData = {
  start: 'live',
  timeline: [
    show(['survey:famousGalaxy'], 1),
    lookAt(M31, 3),
    focus(M31),
    hold(1),
    all([moveTargetId(M31, 6), dollyToId(M31, 6)]),
  ],
};
