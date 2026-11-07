/**
 * create — the renderer and the haze's upsample blit, then the two slots. Each slot's fetcher checks the pair against the
 * other's committed value, so whichever lands second runs the check; core fades the streaks in
 * on the bin's commit through the asset row's `gates`.
 */

import type { LayerCoreDeps } from '../../@types/engine/layer/LayerCoreDeps';
import type { StellarStreamsRuntime } from './@types/StellarStreamsRuntime';

import { HDR_TARGET_FORMAT } from '../../data/renderTargetFormats';
import { createAdditiveUpsample } from '../../services/gpu/passes/additiveUpsample';
import { createStellarStreamsMetaSlot } from './catalog/load/stellarStreamsMetaSlot';
import { createStellarStreamsSlot } from './catalog/load/stellarStreamsSlot';
import { createStellarStreamsRenderer } from './streaks/render/stellarStreamsRenderer';

export function create(deps: LayerCoreDeps): StellarStreamsRuntime {
  const pickCode = deps.pickCode('stream');
  const renderer = createStellarStreamsRenderer(deps.ctx.device, HDR_TARGET_FORMAT, pickCode);
  const hazeUpsample = createAdditiveUpsample(deps.ctx.device, HDR_TARGET_FORMAT);
  const slot = createStellarStreamsSlot(renderer, () => metaSlot.current()?.length ?? null);
  const metaSlot = createStellarStreamsMetaSlot(() => slot.current()?.streamCount ?? null);
  return { renderer, hazeUpsample, slot, metaSlot, meta: () => metaSlot.current(), pickCode };
}
