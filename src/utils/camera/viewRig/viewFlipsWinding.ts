/**
 * viewFlipsWinding — does this view's projection mirror triangle winding. Every
 * capture face negates clip-Y (`faceViewSpec`'s `clipYFlip`, the cube texture's
 * convention), and a mirror turns counter-clockwise triangles clockwise: a
 * `cullMode: 'back'` pipeline drawing into a face culls the NEAR side of a globe.
 * A culling renderer swaps its cull mode when this is true.
 */

import type { FrameView } from '../../../@types/engine/frame/FrameView';

export function viewFlipsWinding(ctx: FrameView): boolean {
  return ctx.viewKind === 'capture';
}
