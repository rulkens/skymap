/**
 * milkyWayCloudLiveness — the ONE derivation of "is the Milky Way point cloud live
 * this frame, and at what opacity?", shared by the aggregate producer, the upsample
 * consumer and the dust pass, so the upsample can never composite an offscreen
 * nobody wrote. The disk's handed value carries the toggle and its fade-out tail;
 * its distance bands are folded in by core; the final `alpha > 0` gate below covers the
 * apparent-size band. Its focus
 * emphasis is composed here once, for all three, keyed on the disk's own pick word, with the
 * focus sphere's dim at the Galactic Centre on top, as the galaxy disks take it on the GPU.
 *
 * Uses the CANVAS height, not the slab view's viewport: the aggregate layer renders
 * into a FRACTION of the canvas, so `view.viewportPx` would split the three gates.
 */

import type { FrameView } from '../../../../@types/engine/frame/FrameView';
import { milkyWayFadeAlpha } from './milkyWayFadeAlpha';
import { visibilityEntryOf } from '../../../../utils/visibility/visibilityEntryOf';
import { emphasisOf } from '../../../../services/engine/presentation/emphasisOf';
import { milkyWayVisibility } from '../../visibility';
import { milkyWayPickId } from '../../picking/present/milkyWayPickId';
import { focusAlphaMultiplier } from '../../../../utils/structure/focusAlphaMultiplier';
import { MILKY_WAY_CENTER_WORLD } from '../../../../data/milkyWay/galacticCenter';

const DISK_ENTRY = visibilityEntryOf(milkyWayVisibility, 'milkyWayDisk');

export function deriveMilkyWayCloudAlpha(
  ctx: FrameView,
  fade: number,
  pickCode: number,
): number | null {
  const camDistMpc = Math.hypot(ctx.drawCamPos[0], ctx.drawCamPos[1], ctx.drawCamPos[2]);
  const alpha =
    milkyWayFadeAlpha(camDistMpc, ctx.drawPxPerRad) *
    fade *
    emphasisOf(DISK_ENTRY, ctx.snapshot, milkyWayPickId(pickCode)) *
    focusAlphaMultiplier(MILKY_WAY_CENTER_WORLD, ctx.snapshot.focus);

  return alpha > 0 ? alpha : null;
}
