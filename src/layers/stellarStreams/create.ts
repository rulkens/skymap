/**
 * create — PROTOTYPE: builds the renderer and fetches the particle bin straight
 * into it (no AssetSlot, no fade row yet).
 */

import type { LayerCoreDeps } from '../../@types/engine/layer/LayerCoreDeps';
import type { StellarStreamsRuntime } from './@types/StellarStreamsRuntime';

import { HDR_TARGET_FORMAT } from '../../data/renderTargetFormats';
import { dataUrl } from '../../services/loading/fetchWithProgress';
import { createStellarStreamsRenderer } from './render/stellarStreamsRenderer';

export function create(deps: LayerCoreDeps): StellarStreamsRuntime {
  const renderer = createStellarStreamsRenderer(deps.ctx.device, HDR_TARGET_FORMAT);
  void fetch(dataUrl('stellar_streams.bin'))
    .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`HTTP ${r.status}`))))
    .then((buf) => renderer.upload(new Float32Array(buf)))
    .catch((err: unknown) => console.warn('[stellarStreams] bin failed to load:', err));
  return { renderer };
}
