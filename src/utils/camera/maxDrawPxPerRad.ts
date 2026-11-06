import type { FrameView } from '../../@types/engine/frame/FrameView';

/** The largest pixels-per-radian over a frame's drawing views, which is what a size gate
 *  measures against. A capture face renders one static frame for an export, not the live
 *  scene, so its resolution must not pull assets in. 0 when nothing draws. */
export function maxDrawPxPerRad(
  views: readonly Pick<FrameView, 'drawPxPerRad' | 'viewKind'>[],
): number {
  let max = 0;
  for (const view of views) {
    if (view.viewKind !== 'capture' && view.drawPxPerRad > max) max = view.drawPxPerRad;
  }
  return max;
}
