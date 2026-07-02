/**
 * Nearest neighbour — the first rung of the ladder. Reveal the famous
 * galaxies (hidden by the opening strip), turn the view until Andromeda
 * drifts toward centre frame, name it, breathe, then fly out to it.
 *
 * `focusOnId` is deliberately decomposed here: the `focus()` cue fires between
 * the aim and the fly, so under the tour's focusedOnly label mode Andromeda's
 * name appears the moment it centres — the viewer reads WHERE they are about
 * to go before the camera commits.
 *
 * The aim rides with a lateral strafe: at the exact bearing the Milky Way
 * (still the orbit target) stacks dead in front of Andromeda. The concurrent
 * `strafeId` slides the rig sideways while the view turns, so the two
 * separate — home drifts just left of frame while Andromeda holds near
 * centre — before the fly recentres onto M31. Composable because they write
 * different channels: the strafe moves `target`, the aim moves yaw/pitch.
 */

import type { ClipData } from '../../../../@types/animation/ClipData';
import {
  all,
  dollyToId,
  focus,
  hold,
  lookAtId,
  moveTargetId,
  show,
  strafeId,
} from '../../../../services/engine/animation/effectHelpers';
import { focusId } from '../../../../utils/animation/focusId';

const M31 = focusId('m31');

export const approachM31: ClipData = {
  start: 'live',
  timeline: [
    show(['survey:famousGalaxy'], 1),
    all([lookAtId(M31, 3), strafeId(M31, 10, 3)]),
    focus(M31),
    hold(1),
    all([moveTargetId(M31, 6), dollyToId(M31, 6)]),
  ],
};
