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
 * The dwell's orbit is SIZED TO LAND on a chosen bearing: its net yaw
 * carries the camera from the arrival bearing to the M81 Group's
 * direction, which the Local-Group
 * beat inherits untouched — its enter writes only target/distance — so the
 * pull-back there separates home and Andromeda on screen instead of
 * stacking them. Both bearings are pure seed geometry
 * (orbitAnglesLookingAlong convention):
 * arrival yaw is the lookAtId(M31) bearing from the Milky-Way target
 * (nothing after it rotates — strafe/moveTarget write `target`, dolly writes
 * `distance`), and the exit yaw looks along M31 → M81 Group. Constants, not
 * runtime lookups, because the subjects' positions are static catalog seeds;
 * re-derive if the enter clip is re-blocked onto a different aim.
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
import { dwellDrift } from '../../../../state/tour/dwellDrift';

const M31 = focusId('m31');

const DWELL_SEC = 10;
// Ecliptic-frame yaws (the default the shared decode reads through
// ORIENTATION_FRAMES.ecliptic) of the same two world sightlines.
const ARRIVAL_YAW_RAD = -1.074327; // lookAtId(M31) bearing from the MW target (−61.55°)
const EXIT_YAW_RAD = 0.804001; // M81 Group centre-frame beyond M31 (+46.07°)
// Ecliptic short way is +107.6°; the '- 2π' below takes the backward −252.4°
// path instead — same spin sense as the earlier beats, brisker close in. Both
// paths land on the exit bearing; the landing is the invariant, the sweep the
// visual tuning knob.
const NET_YAW_RAD = EXIT_YAW_RAD - ARRIVAL_YAW_RAD - Math.PI * 2;

export const approachM31Dwell: ClipData = dwellDrift(DWELL_SEC, {
  cruiseRate: NET_YAW_RAD / DWELL_SEC,
});

export const approachM31: ClipData = {
  start: 'live',
  timeline: [
    show(['survey:famousGalaxy'], 1),
    all([lookAtId(M31, 3), strafeId(M31, 10, 3)]),
    focus(M31),
    hold(1),
    // Land a touch tighter than the standard 8-diameter framing — Andromeda
    // is the beat's whole subject, so let it fill more of the frame.
    all([moveTargetId(M31, 6), dollyToId(M31, 6, { scale: 0.7 })]),
  ],
};
