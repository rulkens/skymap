/**
 * constellationsBand — heliocentric-origin distance band for the
 * constellation overlay, TOGGLE-INDEPENDENT. The one place the constellation
 * band is looked up, so the stick figures and their names never read
 * different bands.
 */

import type { FrameView } from '../../../@types/engine/frame/FrameView';
import { fadeBand } from '../../../utils/math/fadeBand';
import { SCALE_FADE_BANDS } from '../../../services/engine/presentation/scaleFadeBands';

// Toggle-free so `enabled()`'s hard cull works ("opacity 0 ⇒ no render"):
// a zero band disables the row regardless of the toggle.
export function constellationsBand(ctx: Pick<FrameView, 'drawCamPos'>): number {
  const camDistMpc = Math.hypot(ctx.drawCamPos[0], ctx.drawCamPos[1], ctx.drawCamPos[2]);
  return fadeBand(SCALE_FADE_BANDS.constellations, camDistMpc);
}
