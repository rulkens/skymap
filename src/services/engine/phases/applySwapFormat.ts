/**
 * applySwapFormat — reconfigure the canvas context, repoint the `swap` row,
 * then rebuild the renderers baking that format, in that order. No-ops when
 * `desired` already matches live (repeated dispatch must not rebuild eight
 * pipelines) — and also before `renderTargets`/`uiCtx` exist: initGpu's boot
 * dispatch of `engineHdrCapabilityChanged` fires before it builds either, and
 * at boot `desired` can only equal the format device.ts already configured
 * (`DEFAULT_HDR_ENABLED` is false), so there is nothing yet to apply.
 */

import { buildSwapRenderers } from './buildSwapRenderers';

import type { EngineState } from '../../../@types/engine/state/EngineState';

export function applySwapFormat(state: EngineState, desired: GPUTextureFormat): void {
  if (state.gpu.renderTargets === null || state.gpu.uiCtx === null) return;

  const renderTargets = state.gpu.renderTargets;
  const live = renderTargets.specs.find((spec) => spec.id === 'swap')!.format;
  if (live === desired) return;

  const { device, context } = state.gpu.uiCtx;
  context.configure({
    device,
    format: desired,
    alphaMode: 'premultiplied',
    ...(desired === 'rgba16float' ? { toneMapping: { mode: 'extended' } } : {}),
  });
  renderTargets.setSwapFormat(desired);
  buildSwapRenderers(state, desired);
}
