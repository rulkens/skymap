/**
 * The Local Group — the step between "one neighbour" and "a neighbourhood
 * of groups": pull back from Andromeda until home and its neighbour sit in
 * one frame, and name the family they belong to.
 *
 * The enter is wordless. The group ring lights, focusedOnly flips OFF so
 * the family reads with its members named — the Milky Way (its label layer
 * has been lit since the you-are-here beat; only the mode suppressed it),
 * Andromeda, and Triangulum. No per-galaxy label pinning is needed: the
 * famous producer's 6 px apparent-size gate curates by itself at this
 * framing — the three big spirals clear it, every dwarf falls below it.
 * The focus() cue then names the group (its structure label draws because
 * 'structureRing:group' is this beat's own reveal), and only then does the
 * camera commit: the target pans
 * from M31 to the group barycentre while the dolly pulls out to the ring's
 * framing. The barycentre sits ON the Milky-Way–M31 sightline (~0.43 Mpc
 * out), so the pull-back reads as "recede from Andromeda until home slides
 * into frame beside it" — no aim change needed, and none is authored: the
 * enter writes only `target` and `distance`, so the bearing the Andromeda
 * dwell landed on carries through untouched. That inherited bearing is ~79°
 * off the stacking axis, which is what separates the two galaxies on screen
 * instead of piling one behind the other.
 *
 * The dwell orbits the family — the only subject we are INSIDE, so the
 * sweep shows the dwarfs strung between the two big spirals from every
 * side. It does NOT land on the M81 Group's bearing itself — that would put
 * the exact landing two beats before the flythrough that needs it, and a
 * yaw change that far out also swings the flyPath's launch EYE (target +
 * distance·dir) around a wide orbit, reintroducing an opening whip-pan the
 * flythrough was built not to have. `neighbourhoodReveal`'s dwell, right
 * before the flythrough and with a STATIONARY target across its own window,
 * owns that exact landing instead (see its header). This dwell is a plain
 * `cruiseRate` — a RATE, not a bearing, so its MAGNITUDE (radians covered)
 * needs no resolution against any subject. Its AXIS is not frame-invariant,
 * though: `spin('yaw', …)` still turns about whichever orientation frame is
 * live when the clip plays (there is no clip-local orbit axis — a deferred
 * item, see the spec), so the same authored rate sweeps a physically
 * different arc in world space under a different committed pole. This beat's
 * frame is pinned supergalactic for the whole outward stretch (see
 * `approachM31`'s `frameTo`), so today the rate is tuned once against that
 * one axis — tuned to cover most of the shared backward revolution the two
 * dwells' pacing was originally split across, leaving `neighbourhoodReveal`'s
 * `spinToId` to close whatever arc remains onto M81, exactly, regardless of
 * where this dwell happens to stop.
 *
 * The first real survey reveal rides this beat's opening: 2MRS fades in
 * with the group ring, so the family shot reads as a populated region and
 * the reveal beat's pull-out to neighbourhood scale is already dressed.
 */

import type { ClipData } from '../../../../@types/animation/ClipData';
import {
  all,
  dollyToId,
  focus,
  hold,
  moveTargetId,
  scene,
  show,
} from '../../../../services/engine/animation/effectHelpers';
import { focusId } from '../../../../utils/animation/focusId';
import { setLabelsFocusedOnly } from '../../../../state/settings/settingsSlice';
import { dwellDrift } from '../../../../state/tour/dwellDrift';

const LOCAL_GROUP = focusId('group-local-group');

export const localGroup: ClipData = {
  start: 'live',
  timeline: [
    // 2MRS arrives WITH the group: the family shot reads as a populated
    // region, and the later pull-out to neighbourhood scale is already
    // dressed (the flythrough's own show is then a dedup no-op).
    show(['survey:2mrs', 'structureRing:group'], 3),
    scene(setLabelsFocusedOnly(false)),
    focus(LOCAL_GROUP),
    hold(1),
    // Standard structure framing deliberately lands INSIDE the ring's
    // close-approach fade (FOCUS_FILL overflows the viewport 2.2:1 so the
    // chrome is gone on arrival) — the opposite of what this beat wants: the
    // circle IS the subject, the one mark that draws the family as a unit.
    // 2.75× the resolved distance puts the ring at ~0.4× the half-viewport —
    // whole circle in frame, below the 700 px fade start, label included.
    all([moveTargetId(LOCAL_GROUP, 8), dollyToId(LOCAL_GROUP, 8, { scale: 2.75 })]),
  ],
};

const DWELL_SEC = 14;
// Orbit speed, not a bearing — the MAGNITUDE (radians covered) is frame-
// invariant, needing no resolution against a subject. The axis it turns
// about is still the live orientation frame's pole (see the header) — not
// pinned to this clip, so this number is tuned against whichever frame is
// committed while this beat plays (supergalactic — see `approachM31`).
// Preserves the pacing this dwell has always had: most of the shared
// backward revolution toward the M81 Group, leaving `neighbourhoodReveal`'s
// `spinToId` to land on it exactly (see this file's header and that file's
// for the split).
const NET_YAW_RAD = -4.733715;

export const localGroupDwell: ClipData = dwellDrift(DWELL_SEC, {
  cruiseRate: NET_YAW_RAD / DWELL_SEC,
});
