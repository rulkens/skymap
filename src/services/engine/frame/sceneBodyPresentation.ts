/**
 * sceneBodyPresentation — the frame's scene bodies sorted by apparent size, bound to a
 * view the same way for every pass (`ctx.drawCamPos`, `ctx.drawPxPerRad`), so passes
 * taking opposite branches cannot disagree. Each call sorts afresh: the pick path derives
 * frame contexts speculatively, so a cached per-view answer could outlive its view.
 */

import type { FrameView } from '../../../@types/engine/frame/FrameView';
import type { SceneBodyPresentation } from '../../../@types/engine/frame/SceneBodyPresentation';
import { partitionBodiesByPresentation } from './partitionBodiesByPresentation';

export function sceneBodyPresentation(ctx: FrameView): SceneBodyPresentation {
  return partitionBodiesByPresentation({
    bodies: ctx.snapshot.sceneBodies,
    camPosMpc: ctx.drawCamPos,
    pxPerRad: ctx.drawPxPerRad,
  });
}
