/**
 * Home again — the return, and the tour's landing. One continuous inward
 * log-dolly from the horizon straight back to the Milky Way: ~5 decades in
 * 12 seconds, fast but uniform in log-space, so it reads as a smooth rush
 * home back through everything the tour visited rather than a blur. The
 * outbound journey was the story; the return is "you're home, go explore."
 *
 * The dive lands on the OPENING pose exactly: `dollyToId(milkyWay)` resolves
 * the same 0.15 Mpc framing the tour opened on, the target tracks to the
 * galaxy's centre, and a concurrent `aimAt` returns the bearing to the boot
 * orientation — three separate channels (target / distance / yaw+pitch), one
 * `all`, the same triple the opening snap used, played slow instead of
 * snapped. The focus + label reveal bookend beat 01: home is named again as
 * it swells back into frame. No enter clip — the rush IS the beat, and the
 * caption's invitation to explore rides it the whole way down.
 *
 * On the settle the tour ends and `guidedTourSaga`'s snapshot restore winds
 * every scene cue back — the layers lit and hidden along the way revert to
 * the viewer's pre-tour settings, with the camera left on the home framing.
 */

import type { ClipData } from '../../../../@types/animation/ClipData';
import {
  aimAt,
  all,
  dollyToId,
  focus,
  moveTargetId,
  show,
} from '../../../../services/engine/animation/effectHelpers';
import { focusId } from '../../../../utils/animation/focusId';
import { dwellDrift } from '../../../../state/tour/dwellDrift';
import { BOOT_PITCH_RAD, BOOT_YAW_RAD } from '../../../../services/engine/camera/cameraFraming';

const MILKY_WAY = focusId('milkyWay');

export const homeAgain: ClipData = {
  start: 'live',
  timeline: [
    show(['label:milkyWay'], 1),
    focus(MILKY_WAY),
    all([
      moveTargetId(MILKY_WAY, 12),
      dollyToId(MILKY_WAY, 12),
      aimAt({ yaw: BOOT_YAW_RAD, pitch: BOOT_PITCH_RAD }, 12),
    ]),
    // A gentle drift on the landing — home breathes while the closing
    // caption finishes, then the tour ends on the settle.
    ...dwellDrift(5).timeline,
  ],
};
