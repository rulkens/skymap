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
 * side. `spinToId` sends it all the way round to the M81 Group's bearing —
 * the flythrough's first knot — resolved live (a sightline, not a stored
 * angle) so it lands on the same subject under whichever orientation frame
 * is committed. `turns: -1` keeps the backward spin sense the earlier dwells
 * share (the short way is a −7.2° sliver; a whole negative revolution makes
 * the orbit the beat's actual content).
 *
 * NOTE: the neighbourhood-reveal beat right after this one ALSO drifts
 * (its own `REVEAL_NET_YAW_RAD`, unrelated to this dwell now that the
 * landing resolves geometrically instead of splitting one shared
 * revolution across both beats) — see that beat's header for the
 * consequence.
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

export const localGroupDwell: ClipData = dwellDrift(DWELL_SEC, {
  spinTo: focusId('group-m81-group'),
  turns: -1,
});
