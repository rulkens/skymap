/**
 * applySwapFormat — reconfigure the canvas context, repoint the `swap` row,
 * then rebuild the renderers baking that format, in that order. No-ops when
 * `desired` already matches live (repeated dispatch must not rebuild eight
 * pipelines) — and also before `renderTargets`/`uiCtx`/`fontAtlases` exist:
 * initGpu builds `uiCtx`/`fontAtlases` before `renderTargets` (a
 * `GPU_HANDLE_ROWS` row), so a boot-time or leaked-listener call can land
 * between them regardless of which order they're built in — the guard is a
 * conjunction of all three, and `buildSwapRenderers` dereferences
 * `fontAtlases` non-null.
 */

import { buildSwapRenderers } from './buildSwapRenderers';

import type { EngineState } from '../../../@types/engine/state/EngineState';

export function applySwapFormat(state: EngineState, desired: GPUTextureFormat): void {
  if (state.gpu.renderTargets === null || state.gpu.uiCtx === null) return;
  if (state.gpu.fontAtlases === null) return;

  const renderTargets = state.gpu.renderTargets;
  const live = renderTargets.specOf('swap').format;
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
  // context.configure() replaces the drawing buffer; neither trigger
  // (setHdrEnabled, engineHdrCapabilityChanged) is a wake route, so without
  // this the canvas stays blank until the next interaction wakes the loop.
  state.subsystems.scheduler.requestRender();
}
