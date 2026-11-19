/**
 * layerViewFor — a render step's colour view in a layered target row: the layer THIS
 * view owns (`FrameView.layer`), since WebGPU rejects a multi-layer view as an
 * attachment. A view that owns none is a wiring bug, hence the throw.
 */

import type { FrameView } from '../../../@types/engine/frame/FrameView';

export function layerViewFor(id: string, ctx: FrameView): GPUTextureView {
  if (ctx.layer === undefined) {
    throw new Error(`executeFrame: view '${ctx.id}' owns no layer of layered target '${id}'`);
  }
  return ctx.snapshot.renderTargets.layerViewOf(id, ctx.layer);
}
