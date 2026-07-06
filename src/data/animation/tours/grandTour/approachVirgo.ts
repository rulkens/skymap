/**
 * The nearest cluster — step up from "neighbourhood" to "cluster": turn
 * toward Virgo, name it, then log-dolly out ~4 → ~16 Mpc so the first dense
 * knot of galaxies swells into frame. Same "aim, name, breathe, fly" grammar
 * as the M31 approach — the viewer reads where they are going before the
 * camera commits.
 *
 * Two scene shifts open the beat:
 *
 *   - focusedOnly comes back ON. Beat 3 flipped it off so the neighbourhood
 *     read as a populated place; this beat has ONE subject again, and a
 *     thousand-galaxy swarm under many-labels mode would be noise.
 *   - The group rings recede and the cluster rings take over — each ring
 *     category belongs to the scale that introduced it. (2MRS is already in
 *     — the neighbourhood beat revealed it — so Virgo reads as a swarm the
 *     moment the view turns to it.)
 *
 * The aim rides a strafe (same composition as the M31 approach): the old
 * anchor is Centaurus A — a bright sprite — and at the exact Virgo bearing
 * it would stack dead on the boresight. The concurrent strafe slides the rig
 * sideways so Cen A drifts off-centre while Virgo holds the frame.
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
  strafeId,
} from '../../../../services/engine/animation/effectHelpers';
import { focusId } from '../../../../utils/animation/focusId';
import { setLabelsFocusedOnly } from '../../../../state/settings/settingsSlice';

const VIRGO = focusId('cluster-virgo-m87');

export const approachVirgo: ClipData = {
  start: 'live',
  timeline: [
    scene(setLabelsFocusedOnly(true)),
    hide(['structureRing:group'], 1),
    show(['survey:glade', 'survey:sdss', 'structureRing:cluster'], 2),
    all([lookAtId(VIRGO, 3), strafeId(VIRGO, 10, 3)]),
    focus(VIRGO),
    hold(1),
    all([moveTargetId(VIRGO, 7), dollyToId(VIRGO, 7)]),
  ],
};
