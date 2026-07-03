/**
 * Cosmic flows — the bridge between the web's two halves: stage 05 showed
 * fullness, stage 07 will show emptiness, and this beat shows the mechanism
 * that links them — matter streams out of the voids, along the filaments,
 * into the dense clumps. The CF4++ flow field makes that motion visible, and
 * it is the only beat that adds TIME to the tour: the streamlines animate
 * while the camera all but holds still.
 *
 * Turn-name-fly onto Laniakea, our own flow basin. The subject is Laniakea
 * rather than the Norma/Great-Attractor cluster for two reasons: the basin —
 * not one cluster at its bottom — is what the streamlines converge on, and
 * Laniakea is category `supercluster`, whose rings (and therefore focused
 * label) are already lit from the web beat; Norma's `cluster` category was
 * hidden at the Virgo→web scale step, so its label would be gated off. The
 * narration names the Great Attractor; the label names the basin.
 *
 * The dolly is an explicit `dollyTo(FLOW_BASIN_MPC)`, not `dollyToId`:
 * Laniakea's framed distance would back off far enough to fit its whole
 * ~80 Mpc span, but this beat wants to sit down IN the basin, close enough
 * that individual streamlines read as currents. The flow field's fade rides
 * the travel leg (point cue starts the fade, the fly runs under it), so the
 * motion is at full strength as the camera settles.
 *
 * The web layers (volume, filaments, supercluster rings) deliberately stay
 * lit from the previous beat — the flow must read as motion THROUGH the same
 * density field, not a separate overlay.
 */

import type { ClipData } from '../../../../@types/animation/ClipData';
import {
  all,
  dollyTo,
  focus,
  hold,
  lookAtId,
  moveTargetId,
  scene,
  show,
} from '../../../../services/engine/animation/effectHelpers';
import { focusId } from '../../../../utils/animation/focusId';
import { setLabelsFocusedOnly } from '../../../../state/settings/settingsSlice';

const LANIAKEA = focusId('supercluster-laniakea-sc');

// Close enough that streamlines read as individual currents, wide enough to
// keep a stretch of the basin in frame. The stage doc's held-scale intent
// (~80 Mpc) — eye-tune against the flow layer's density.
const FLOW_BASIN_MPC = 80;

export const cosmicFlows: ClipData = {
  start: 'live',
  timeline: [
    scene(setLabelsFocusedOnly(true)),
    lookAtId(LANIAKEA, 3),
    focus(LANIAKEA),
    hold(1),
    show(['flow'], 6),
    all([moveTargetId(LANIAKEA, 6), dollyTo(FLOW_BASIN_MPC, 6)]),
  ],
};
