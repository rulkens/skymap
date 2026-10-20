/**
 * milkyWayCloudLiveness — the ONE derivation of "is the Milky Way point cloud live
 * this frame, and at what opacity?", shared by the aggregate producer, the upsample
 * consumer and the dust pass, so the upsample can never composite an offscreen
 * nobody wrote. The disk's handed value carries the toggle and its fade-out tail;
 * its distance bands are folded in by core; the final `alpha > 0` gate below covers the
 * apparent-size band. Its focus
 * emphasis is composed here once, for all three, keyed on the disk's own pick word.
 *
 * Uses the CANVAS height, not the slab view's viewport: the aggregate layer renders
 * into a FRACTION of the canvas, so `view.viewportPx` would split the three gates.
 */

import type { FrameView } from '../../../@types/engine/frame/FrameView';
import { milkyWayFadeAlpha } from '../../../services/engine/galaxyGenerator/v1/milkyWayFadeAlpha';
import { visibilityEntryOf } from '../../../utils/visibility/visibilityEntryOf';
import { emphasisOf } from '../../../services/engine/presentation/emphasisOf';
import { milkyWayVisibility } from '../visibility';
import { MILKY_WAY_PICK_ID } from './milkyWayPickId';

const DISK_ENTRY = visibilityEntryOf(milkyWayVisibility, 'milkyWayDisk');

export function deriveMilkyWayCloudAlpha(ctx: FrameView, fade: number): number | null {
  const camDistMpc = Math.hypot(ctx.drawCamPos[0], ctx.drawCamPos[1], ctx.drawCamPos[2]);
  const alpha =
    milkyWayFadeAlpha(camDistMpc, ctx.drawPxPerRad) *
    fade *
    emphasisOf(DISK_ENTRY, ctx.snapshot, MILKY_WAY_PICK_ID);

  return alpha > 0 ? alpha : null;
}
