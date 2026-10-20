/**
 * create — the filaments family's construction in dependency order: the
 * renderer, then the slot that commits into it. No fade is driven here: the
 * asset row's `gates` lets core fade the Layer in on the slot's commit.
 */

import type { LayerCoreDeps } from '../../@types/engine/layer/LayerCoreDeps';
import type { CosmicWebFilamentsRuntime } from './@types/CosmicWebFilamentsRuntime';

import { HDR_TARGET_FORMAT } from '../../data/renderTargetFormats';
import { createFilamentRenderer } from './render/filamentRenderer';
import { createFilamentSlot } from './load/filamentSlot';

export function create(deps: LayerCoreDeps): CosmicWebFilamentsRuntime {
  const renderer = createFilamentRenderer(deps.ctx.device, HDR_TARGET_FORMAT, deps.fadeBgl);
  return { renderer, slot: createFilamentSlot(renderer) };
}
