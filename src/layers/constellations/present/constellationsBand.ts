/**
 * constellationsBand — heliocentric-origin distance band for the
 * constellation overlay, TOGGLE-INDEPENDENT (toggle term pinned to 1) —
 * every figure shares this ONE band rather than a per-anchor distance.
 */

import type { ReadyFrameContext } from '../../../@types/engine/frame/ReadyFrameContext';
import { constellationLayerOpacity } from './constellationLayerOpacity';

// Opacity 1 reduces `constellationLayerOpacity`'s product to the raw band —
// what the toggle-independent hard cull in `enabled()` needs ("opacity 0 ⇒
// no render", so a zero band disables the row regardless of the toggle).
export function constellationsBand(ctx: Pick<ReadyFrameContext, 'drawCamPos'>): number {
  const camDistMpc = Math.hypot(ctx.drawCamPos[0], ctx.drawCamPos[1], ctx.drawCamPos[2]);
  return constellationLayerOpacity(camDistMpc, 1);
}
