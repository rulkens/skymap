/**
 * milkyWayCloudLiveness — the ONE derivation of "is the Milky Way point cloud live
 * this frame, and at what opacity?", shared by the aggregate producer, the upsample
 * consumer and the dust pass, so the upsample can never composite an offscreen
 * nobody wrote. The disk's handed value carries the toggle and its fade-out tail;
 * the final `alpha > 0` gate below covers it and the apparent-size band. Its focus
 * emphasis is composed here once, for all three, keyed on the disk's own pick word.
 *
 * Uses the CANVAS height, not the slab view's viewport: the aggregate layer renders
 * into a FRACTION of the canvas, so `view.viewportPx` would split the three gates.
 */

import type { PassState } from '../../../@types/engine/frame/PassState';
import type { FrameView } from '../../../@types/engine/frame/FrameView';
import { milkyWayFadeAlpha } from '../../../services/engine/galaxyGenerator/v1/milkyWayFadeAlpha';
import { fadeBand } from '../../../utils/math/fadeBand';
import { SCALE_FADE_BANDS } from '../../../services/engine/presentation/scaleFadeBands';
import { sceneBodyStates } from '../../../services/engine/frame/sceneBodyStates';
import { regionRelativeDistanceMpc } from '../../../utils/regions/regionRelativeDistanceMpc';
import { regionById } from '../../../utils/regions/regionById';
import { visibilityEntryOf } from '../../../utils/visibility/visibilityEntryOf';
import { emphasisOf } from '../../../services/engine/presentation/emphasisOf';
import { milkyWayVisibility } from '../visibility';
import { MILKY_WAY_PICK_ID } from './milkyWayPickId';

const GALACTIC_CENTRE_REGION = regionById('galactic-centre');
const DISK_ENTRY = visibilityEntryOf(milkyWayVisibility, 'milkyWayDisk');

export function deriveMilkyWayCloudAlpha(
  state: PassState,
  ctx: FrameView,
  fade: number,
): number | null {
  const camDistMpc = Math.hypot(ctx.drawCamPos[0], ctx.drawCamPos[1], ctx.drawCamPos[2]);
  // Two independent near-side approach fades, combined by MIN: the Sun's own
  // descent (`milkyWayApproachSun`, keyed on the origin — the Sun sits there —
  // the hand-off to the real Gaia star catalog) and the galactic centre's
  // (`milkyWayApproachGc`, keyed on distance from Sgr A*).
  const bodyStates = sceneBodyStates(state, ctx);
  const sunApproach = fadeBand(SCALE_FADE_BANDS.milkyWayApproachSun, camDistMpc);
  const gcDistMpc = regionRelativeDistanceMpc(ctx.drawCamPos, GALACTIC_CENTRE_REGION, bodyStates);
  const gcApproach = fadeBand(SCALE_FADE_BANDS.milkyWayApproachGc, gcDistMpc);
  const approach = Math.min(sunApproach, gcApproach);
  if (approach <= 0) return null;

  const alpha =
    milkyWayFadeAlpha(camDistMpc, ctx.drawPxPerRad) *
    approach *
    fade *
    emphasisOf(DISK_ENTRY, ctx.snapshot, MILKY_WAY_PICK_ID);

  return alpha > 0 ? alpha : null;
}
