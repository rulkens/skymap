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
 * arrived at). The flow reveal fires only ON ARRIVAL — the dive plays over
 * the bare density field, then the currents materialize in the settled
 * frame as the caption lands; the dwell's opening breath covers the fade
 * before the first pull begins.
 *
 * No focus cue — the motion itself is the subject — but focusedOnly flips
 * OFF so every supercluster label draws: at these scales the names are the
 * only landmarks, and the pull-back reads better when the viewer can anchor
 * the streams to Coma, Shapley, Perseus-Pisces. Flood-safe by the ring
 * gate (the neighbourhood-beat lesson): only the supercluster ring category
 * is lit, and every survey has been hidden since the web pull-back, so no
 * other label family can join — except the Milky Way label, lit since the
 * "You are here" beat, which gets an explicit hide to keep the frame to
 * supercluster names alone. The web layers (volume, supercluster rings)
 * stay lit from the previous beat — the flow must read as motion THROUGH
 * the same density field, not a separate overlay.
 */

import type { ClipData } from '../../../../@types/animation/ClipData';
import {
  all,
  dollyTo,
  dollyToId,
  focus,
  hide,
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
    scene(setLabelsFocusedOnly(false)),
    // Focus is beat-local (scene reconstruction doesn't cover it): a skip out
    // of the web beat before its dwell's defocus fires would carry Coma's
    // ring emphasis + recession dimming in here — clear it explicitly.
    focus(null),
    hide(['label:milkyWay'], 1),
    // Target is already Coma in natural playback (the web pull-back only
    // dollied); the moveTargetId is idempotent insurance for a mid-beat skip.
    all([moveTargetId(COMA_SC, 6), dollyToId(COMA_SC, 6)]),
    // Reveal fires after the dive settles — a point cue, so the clip lands
    // (and the caption reveals) as the fade begins.
    show(['flow'], 4),
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
      ...dwellDrift(22, { cruiseRate: (Math.PI * 2) / 60 }).timeline,
      // The opening wait covers the flow's 4 s fade-in plus a beat of settled
      // local currents before the first pull.
      seq([wait(5), dollyTo(LOCAL_FLOWS_MPC, 5), wait(3), dollyTo(GIANT_FLOWS_MPC, 6)]),
    ]),
  ],
};
