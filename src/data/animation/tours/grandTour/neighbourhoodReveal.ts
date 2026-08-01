/**
 * Our neighbourhood — the pull-back reveal between the Local-Group close-up
 * and the flythrough: dolly out from the family until the surrounding
 * groups and the 2MRS field make it one small clump among many.
 *
 * This clip is the beat's DWELL and the beat has no enter clip — the
 * caption is ABOUT the widening view, so it must ride the motion (captions
 * reveal on dwell start; an enter clip would play the pull-back wordless).
 * Same pattern as the flythrough after it.
 *
 * The scene arrived with the Local-Group beat (2MRS, group rings,
 * focusedOnly-off labels); this clip's one cue is `focus(null)` as the pull
 * begins. Holding the Local-Group focus through the zoom-out would keep
 * every sibling ring receded and the member-isolation fade dimming the
 * whole field outside the family — the opposite of a reveal. Clearing it
 * releases the recession (400 ms blend), so the neighbourhood brightens
 * as the camera pulls away.
 *
 * THIS beat's dwell — not the Local-Group dwell before it — is the one that
 * lands facing the M81 Group: `spinToId` resolves that bearing live (a
 * sightline, not a stored angle), landing on the same subject under
 * whichever orientation frame is committed. It belongs here rather than on
 * the Local-Group dwell because this beat's `target` never moves across its
 * own window — the enter clip's `focus(null)` fires INSIDE this dwell's
 * `all`, not before it, so nothing displaces the orbit target the bearing is
 * measured from — and because landing here means `neighbourhoodFlythrough`
 * launches with zero gap between the aim it inherits and the aim its first
 * waypoint needs: no post-landing beat rotates further before the flythrough
 * reads the pose. `turns` is left at its default (0, the shortest arc): the
 * Local-Group dwell's cruiseRate already covers most of the shared backward
 * revolution, so what is left to close here is a short arc, not another lap.
 */

import type { ClipData } from '../../../../@types/animation/ClipData';
import {
  all,
  dollyTo,
  focus,
  seq,
  wait,
} from '../../../../services/engine/animation/effectHelpers';
import { focusId } from '../../../../utils/animation/focusId';
import { dwellDrift } from '../../../../state/tour/dwellDrift';

export const REVEAL_DWELL_SEC = 12;

// Where the pull-out lands: wide enough that the neighbouring groups' scale
// reads (the flythrough's subjects sit ~3.5 Mpc out), eye-tuned from there.
const NEIGHBOURHOOD_MPC = 4.5;

export const neighbourhoodReveal: ClipData = {
  start: 'live',
  timeline: [
    all([
      ...dwellDrift(REVEAL_DWELL_SEC, { spinTo: focusId('group-m81-group') }).timeline,
      // A beat of stillness, then release the focus and pull; the drift
      // outlasts the dolly so the wide shot breathes before the flythrough
      // launches.
      seq([wait(1), focus(null), dollyTo(NEIGHBOURHOOD_MPC, 9)]),
    ]),
  ],
};
