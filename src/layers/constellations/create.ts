/**
 * create — the constellations family's construction in dependency order: the
 * renderer, then the slot that commits into it. No fade is driven here: the
 * asset row's `gates` lets core fade the Layer in on the slot's commit.
 */

import type { LayerCoreDeps } from '../../@types/engine/layer/LayerCoreDeps';
import type { ConstellationsRuntime } from './@types/ConstellationsRuntime';

import { HDR_TARGET_FORMAT } from '../../data/renderTargetFormats';
import { createConstellationRenderer } from './render/constellationRenderer';
import { createConstellationsSlot } from './load/constellationsSlot';

export function create(deps: LayerCoreDeps): ConstellationsRuntime {
  const renderer = createConstellationRenderer(deps.ctx.device, HDR_TARGET_FORMAT, deps.fadeBgl);
  return { renderer, slot: createConstellationsSlot(renderer) };
}
