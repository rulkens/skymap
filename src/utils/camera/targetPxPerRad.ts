import type { ReadyFrameContext } from '../../@types/engine/frame/ReadyFrameContext';

/**
 * targetPxPerRad — a view's pixels per radian on the target it draws into:
 * `drawPxPerRad` holds for the view's own size, and a target spanning the same
 * frustum in fewer rows (a half-res offscreen) scales with its height.
 */
export function targetPxPerRad(
  ctx: Pick<ReadyFrameContext, 'drawPxPerRad' | 'canvasSize'>,
  targetHeightPx: number,
): number {
  return ctx.drawPxPerRad * (targetHeightPx / ctx.canvasSize.height);
}
