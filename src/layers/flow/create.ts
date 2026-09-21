/**
 * create — the flow family's construction in dependency order: the renderer,
 * then the slot that commits into it. No fade is driven here; core owns the
 * arrival edge (`installFadeOnArrival`), and the commit's `upload` is what
 * opens the fade row's guard (`fieldLoaded()`).
 */

import type { LayerCoreDeps } from '../../@types/engine/layer/LayerCoreDeps';
import type { FlowRuntime } from './@types/FlowRuntime';

import { HDR_TARGET_FORMAT } from '../../data/renderTargetFormats';
import { createFlowFieldRenderer } from './render/flowFieldRenderer';
import { createFlowFieldSlot } from './load/flowFieldSlot';

export function create(deps: LayerCoreDeps): FlowRuntime {
  const renderer = createFlowFieldRenderer({
    device: deps.ctx.device,
    targetFormat: HDR_TARGET_FORMAT,
  });
  return { renderer, slot: createFlowFieldSlot(renderer) };
}
