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
 *
 * The dwell's orbit is SIZED TO LAND on the M81 Group's bearing, which the
 * Local-Group beat inherits untouched — its enter writes only
 * target/distance — so the pull-back there separates home and Andromeda on
 * screen instead of stacking them. `spinToId` resolves that landing live
 * (a sightline, not a stored angle), so it lands on the same subject under
 * whichever orientation frame is committed. `turns: -1` takes the long way
 * round — the short way is a +107.6° swing, the backward −252.4° path
 * matches the earlier beats' spin sense and reads brisker close in; the
 * landing is the invariant, the sweep is the visual tuning knob.
 */

import type { ClipData } from '../../../../@types/animation/ClipData';
import {
  all,
  dollyToId,
  focus,
  frameTo,
  hold,
  lookAtId,
  moveTargetId,
  show,
  strafeId,
} from '../../../../services/engine/animation/effectHelpers';
import { focusId } from '../../../../utils/animation/focusId';
import { dwellDrift } from '../../../../state/tour/dwellDrift';
import { FRAME_ROLL_SEC } from './frameRollSec';

const M31 = focusId('m31');

const DWELL_SEC = 10;

export const approachM31Dwell: ClipData = dwellDrift(DWELL_SEC, {
  spinTo: focusId('group-m81-group'),
  turns: -1,
});

export const approachM31: ClipData = {
  start: 'live',
  timeline: [
    // supergalactic from here outward: the local supercluster is the plane
    // this stretch of the tour is a tour OF (docs/tour/implementation-notes.md).
    // This is the tour's first act boundary, so — unlike the opening's roll
    // over empty space — this one plays out over a visible scene; it rides
    // alongside the 3s lookAtId turn below so the tilt and the turn to face
    // Andromeda read as one continuous move, not two.
    frameTo('supergalactic', { over: FRAME_ROLL_SEC }),
    show(['survey:famousGalaxy'], 1),
    all([lookAtId(M31, 3), strafeId(M31, 10, 3)]),
    focus(M31),
    hold(1),
    // Land a touch tighter than the standard 8-diameter framing — Andromeda
    // is the beat's whole subject, so let it fill more of the frame.
    all([moveTargetId(M31, 6), dollyToId(M31, 6, { scale: 0.7 })]),
  ],
};
