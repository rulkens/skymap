/**
 * The cosmic web — the showcase beat, and the first half of the web's central
 * idea (fullness and emptiness belong together; the voids beat is the other
 * half). Turn toward Coma, name it, then log-dolly out ~16 → ~90 Mpc while
 * the MCPM density volume and the DisPerSE filaments fade in — the reveal
 * rides the travel leg, so the web is at full strength as the camera settles
 * into its arrival orbit.
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
  dollyToId,
  focus,
  hide,
  hold,
  lookAtId,
  moveTargetId,
  scene,
  show,
} from '../../../../services/engine/animation/effectHelpers';
import { focusId } from '../../../../utils/animation/focusId';
import { setLabelsFocusedOnly } from '../../../../state/settings/settingsSlice';

const COMA_SC = focusId('supercluster-coma-sc');

export const cosmicWeb: ClipData = {
  start: 'live',
  timeline: [
    scene(setLabelsFocusedOnly(true)),
    hide(['structureRing:cluster'], 1),
    show(['structureRing:supercluster'], 2),
    lookAtId(COMA_SC, 3),
    focus(COMA_SC),
    hold(1),
    show(['volumesMaster', 'filaments'], 9),
    all([moveTargetId(COMA_SC, 9), dollyToId(COMA_SC, 9)]),
  ],
};
