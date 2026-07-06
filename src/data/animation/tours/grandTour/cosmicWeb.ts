/**
 * The cosmic web — the showcase beat, and the first half of the web's central
 * idea (fullness and emptiness belong together; the voids beat is the other
 * half). Turn toward Coma, name it, then log-dolly out ~16 → ~90 Mpc while
 * the MCPM density volume fades in — the reveal rides the travel leg, so the
 * web is at full strength as the camera settles into its arrival orbit. The
 * volume carries the beat alone: the DisPerSE filaments stay hidden — two
 * renderings of the same web compete rather than reinforce.
 *
 * The volume is the hero: galaxies alone read as scatter at this distance;
 * the raymarched field shows the web as continuous density — bright threads
 * and nodes, dark voids. The `show` fires just before the fly with a fade
 * matched to the fly's duration, so the two complete together (a point cue
 * starts the fade and the fly runs under it).
 *
 * Ring scale-step: cluster rings recede, supercluster rings take over — Coma's
 * ring puts a name on the bright clump, reinforcing "superclusters live in
 * the dense knots". focusedOnly stays ON (one subject), restated here because
 * the mode is beat-scoped — stepping back into this beat must re-establish
 * it no matter what a later beat set.
 *
 * These layers deliberately stay lit for the rest of the web section (flows,
 * voids) — those beats read as the SAME web. The tour-end snapshot/restore
 * winds them back.
 */

import type { ClipData } from '../../../../@types/animation/ClipData';
import {
  all,
  dollyTo,
  dollyToId,
  focus,
  hide,
  hold,
  lookAtId,
  moveTargetId,
  scene,
  seq,
  show,
  wait,
} from '../../../../services/engine/animation/effectHelpers';
import { focusId } from '../../../../utils/animation/focusId';
import { setLabelsFocusedOnly } from '../../../../state/settings/settingsSlice';
import { dwellDrift } from '../../../../state/tour/dwellDrift';

const COMA_SC = focusId('supercluster-coma-sc');

// Camera distance that fits the whole MCPM volume: the SCFD wedge reaches
// ~476 Mpc from home, and the orbit target sits out at Coma, so the pull-back
// needs ~R/sin(fovY/2) + the target offset. Eye-tuned, not derived — nudge it
// if the wedge clips or swims too small in frame.
const FIT_WEB_MPC = 250;

export const cosmicWeb: ClipData = {
  start: 'live',
  timeline: [
    scene(setLabelsFocusedOnly(true)),
    hide(['structureRing:cluster'], 1),
    show(['structureRing:supercluster'], 2),
    lookAtId(COMA_SC, 3),
    focus(COMA_SC),
    hold(1),
    show(['volumesMaster'], 9),
    all([moveTargetId(COMA_SC, 9), dollyToId(COMA_SC, 9)]),
  ],
};

/**
 * The dwell: slow rotation throughout, then a pull-back that reveals the
 * WHOLE web — arrive on Coma's node, take it in turning, and end holding the
 * entire MCPM volume in frame (the next beat launches from that wide shot).
 * Same composition idiom as the you-are-here push-in, pointed outward: the
 * dolly rides inside the drift's `all` (it writes `distance`, the drift
 * writes yaw/pitch) and a leading `wait` holds it until the rotation has
 * established the node. The drift outlasts the pull-back by ~10 s on
 * purpose: the landing is the payoff shot, so the camera keeps turning at
 * full width rather than cutting the moment the dolly settles.
 *
 * The pull-back also STRIPS the shot down to the volume: Coma has served its
 * "superclusters live in the dense knots" purpose during the establish, so
 * the defocus fires as the dolly launches and every galaxy catalog fades out
 * over the travel leg — at full width the field reads as pure density, not
 * density plus scatter. Scene reconstruction folds dwell cues, so later
 * beats inherit the galaxy-free state.
 */
export const cosmicWebDwell: ClipData = {
  start: 'live',
  timeline: [
    all([
      ...dwellDrift(22).timeline,
      seq([wait(4), focus(null), hide(['survey'], 8), dollyTo(FIT_WEB_MPC, 8)]),
    ]),
  ],
};
