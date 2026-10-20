/**
 * create — the Local Bubble shell family's construction in dependency
 * order: the renderer, then the slot that commits into it. No fade is
 * driven here: the asset row's `gates` lets core fade the shell in on the
 * slot's commit and out on its release.
 */

import type { LayerCoreDeps } from '../../@types/engine/layer/LayerCoreDeps';
import type { LocalBubbleRuntime } from './@types/LocalBubbleRuntime';

import { HDR_TARGET_FORMAT } from '../../data/renderTargetFormats';
import { createLocalBubbleRenderer } from './render/localBubbleRenderer';
import { createLocalBubbleSlot } from './load/localBubbleSlot';

export function create(deps: LayerCoreDeps): LocalBubbleRuntime {
  const renderer = createLocalBubbleRenderer(deps.ctx.device, HDR_TARGET_FORMAT);
  return { renderer, slot: createLocalBubbleSlot(renderer) };
}
