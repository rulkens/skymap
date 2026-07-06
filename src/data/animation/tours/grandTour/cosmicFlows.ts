/**
 * Cosmic flows — the bridge between the web's two halves: stage 05 showed
 * fullness, stage 07 will show emptiness, and this beat shows the mechanism
 * that links them — matter streams out of the voids, along the filaments,
 * into the dense clumps. The CF4++ flow field makes that motion visible, and
 * it is the only beat that adds TIME to the tour: the streamlines animate.
 *
 * The shape is borrowed from the standalone `cosmicFlows` showcase clip
 * (clips/cosmicFlows.ts), whose two-step pull-back is the beat's whole idea:
 * establish the LOCAL currents close in, then pull out — twice, with a
 * breath between — until the giant streams spanning the volume read as one
 * connected circulation. The web dwell ended wide on the pure volume with
 * the target still parked on Coma, so the enter simply dives back down to
 * Coma's derived framing (`dollyToId`, the same distance the web beat
 * arrived at) while the flow fades in over the travel leg — the currents
 * are at full strength when the caption lands, and the pull-back then rides
 * the captioned dwell.
 *
 * No focus cue: the web beat already named Coma, and this beat's subject is
 * the motion itself — under focusedOnly an unfocused shot draws no labels,
 * which is the clean frame the streamlines want. The web layers (volume,
 * supercluster rings) stay lit from the previous beat — the flow must read
 * as motion THROUGH the same density field, not a separate overlay.
 */

import type { ClipData } from '../../../../@types/animation/ClipData';
import {
  all,
  dollyTo,
  dollyToId,
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

// The showcase clip's two pull-back landings: first the mid scale where the
// larger basin-to-basin streams appear, then wide enough that the volume's
// whole circulation reads at once. Eye-tune against the flow layer's density.
const LOCAL_FLOWS_MPC = 300;
const GIANT_FLOWS_MPC = 950;

export const cosmicFlows: ClipData = {
  start: 'live',
  timeline: [
    scene(setLabelsFocusedOnly(true)),
    show(['flow'], 6),
    // Target is already Coma in natural playback (the web pull-back only
    // dollied); the moveTargetId is idempotent insurance for a mid-beat skip.
    all([moveTargetId(COMA_SC, 6), dollyToId(COMA_SC, 6)]),
  ],
};

/**
 * The dwell: the two-step zoom out, captioned. A gentle drift supplies the
 * parallax that makes the 3D streaming read (the flowOrbit lesson), and the
 * dolly steps ride inside its `all` — distance vs yaw/pitch, separate
 * channels. Each pull lands on a breath (`wait`) so the new scale registers
 * before the next pull begins.
 */
export const cosmicFlowsDwell: ClipData = {
  start: 'live',
  timeline: [
    all([
      ...dwellDrift(18, { cruiseRate: (Math.PI * 2) / 120 }).timeline,
      seq([wait(2), dollyTo(LOCAL_FLOWS_MPC, 5), wait(4), dollyTo(GIANT_FLOWS_MPC, 6)]),
    ]),
  ],
};
