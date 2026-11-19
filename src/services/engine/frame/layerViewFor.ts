/**
 * layerViewFor — the layer of a layered target row THIS view owns (`FrameView.layer`):
 * WebGPU rejects a multi-layer view as an attachment.
 */

import type { FrameView } from '../../../@types/engine/frame/FrameView';

export function layerViewFor(id: string, ctx: FrameView): GPUTextureView {
  if (ctx.layer === undefined) {
    throw new Error(`executeFrame: view '${ctx.id}' owns no layer of layered target '${id}'`);
  }
  return ctx.snapshot.renderTargets.layerViewOf(id, ctx.layer);
}
