/**
 * The Local Group — the step between "one neighbour" and "a neighbourhood
 * of groups": pull back from Andromeda until home and its neighbour sit in
 * one frame, and name the family they belong to.
 *
 * The enter is wordless. The group ring lights, the focus() cue names the
 * Local Group (under the tour's focusedOnly mode the focus IS the label
 * reveal — the ring gate passes because 'structureRing:group' is this
 * beat's own reveal), and only then does the camera commit: the target pans
 * from M31 to the group barycentre while the dolly pulls out to the ring's
 * framing. The barycentre sits ON the Milky-Way–M31 sightline (~0.43 Mpc
 * out), so the pull-back reads as "recede from Andromeda until home slides
 * into frame beside it" — no aim change needed, and none is authored: the
 * enter writes only `target` and `distance`, so the bearing the Andromeda
 * dwell landed on carries through untouched. That inherited bearing is ~79°
 * off the stacking axis, which is what separates the two galaxies on screen
 * instead of piling one behind the other.
 *
 * The dwell is one full revolution around the family — the only beat that
 * orbits its subject completely, because the subject is the one structure
 * we are INSIDE: the sweep shows the dwarfs strung between the two big
 * spirals from every side. Its net yaw is sized to land facing the M81
 * Group (the flythrough's first knot), same seed-geometry procedure as the
 * Andromeda dwell: exit yaw looks along LG barycentre → M81 Group centre,
 * and the wrap is chosen backward — the short way is a +6° sliver, so one
 * whole negative revolution keeps the earlier dwells' spin direction and
 * makes the orbit the beat's actual content. Constants, not runtime
 * lookups (static catalog seeds); re-derive if the enter gains an aim.
 *
 * The second half of the dwell is the bridge to the flythrough: 2MRS fades
 * in as a dolly pulls out to neighbourhood scale, so the wider field the
 * caption's successor sweeps through is already populated when the beat
 * cuts. Same drift-with-embedded-pullback idiom as the cosmic-web dwell —
 * the dolly writes `distance` inside the drift's `all`, a leading wait
 * holds it until the orbit has established the group up close.
 */

import type { ClipData } from '../../../../@types/animation/ClipData';
import {
  all,
  dollyTo,
  dollyToId,
  focus,
  hold,
  moveTargetId,
  seq,
  show,
  wait,
} from '../../../../services/engine/animation/effectHelpers';
import { focusId } from '../../../../utils/animation/focusId';
import { dwellDrift } from '../../../../state/tour/dwellDrift';

const LOCAL_GROUP = focusId('group-local-group');

export const localGroup: ClipData = {
  start: 'live',
  timeline: [
    show(['structureRing:group'], 2),
    focus(LOCAL_GROUP),
    hold(1),
    all([moveTargetId(LOCAL_GROUP, 8), dollyToId(LOCAL_GROUP, 8)]),
  ],
};

const DWELL_SEC = 24;
// Where the pull-out lands: wide enough that the neighbouring groups' scale
// reads (the flythrough's subjects sit ~3.5 Mpc out), eye-tuned from there.
const NEIGHBOURHOOD_MPC = 4.5;
const ARRIVAL_YAW_RAD = 2.602475; // inherited: the Andromeda dwell's landing bearing
const EXIT_YAW_RAD = 2.706202; // M81 Group centre-frame from the LG barycentre
// One full backward revolution (see module header for why not the +6° sliver).
const NET_YAW_RAD = EXIT_YAW_RAD - ARRIVAL_YAW_RAD - Math.PI * 2;

export const localGroupDwell: ClipData = {
  start: 'live',
  timeline: [
    all([
      ...dwellDrift(DWELL_SEC, { cruiseRate: NET_YAW_RAD / DWELL_SEC }).timeline,
      seq([wait(10), show(['survey:2mrs'], 10), dollyTo(NEIGHBOURHOOD_MPC, 10)]),
    ]),
  ],
};
