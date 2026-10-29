/**
 * initGpu — bootstrap phase that acquires the WebGPU device + swap-chain context,
 * builds the shared BGL/uiCtx/fontAtlases/env-BRDF prerequisites, then constructs every GPU
 * handle via `constructGpuHandles`/`GPU_HANDLE_ROWS` (see `../gpuHandles/`). Runs
 * first because every later phase needs the device.
 *
 * `device` / `context` survive past this phase via the `phaseLocals` carrier (see
 * `BootstrapDeps`); `state.gpu.uiCtx` is a narrower home for the same two values +
 * `canvas`, also read by `applySwapFormat`/`buildSwapRenderers` on a later rebuild.
 */

import { initGpu as gpuInitGpu, resizeCanvasToDisplay, watchHdrCapability } from '../../gpu/device';
import { trackGpuMemory } from '../../gpu/memory/trackGpuMemory';
import { createGpuTimingService } from '../../gpu/timing/gpuTimingService';
import { TIMED_SLOTS } from '../frame/timing/timedSlots';
import { loadFontAtlases } from '../../gpu/labelLayout/loadFontAtlases';
import { loadEnvBrdfLut } from '../../gpu/resources/loadEnvBrdfLut';
import { loadDataManifest } from '../../loading/dataManifest';
import { engineHdrCapabilityChanged } from '../../../state/engine/engineSlice';
import { hasUrlGate } from '../../../utils/url/hasUrlGate';
import { isPerfMode } from '../../../utils/url/isPerfMode';
import { createFadeUniformsBgl } from '../../gpu/bindGroupLayouts/fadeUniforms';
import { createSourceUniformsBgl } from '../../gpu/bindGroupLayouts/sourceUniforms';
import { createFocusUniformsBgl } from '../../gpu/bindGroupLayouts/focusUniforms';
import { constructGpuHandles } from '../gpuHandles/constructGpuHandles';
import { GPU_HANDLE_ROWS } from '../gpuHandles/gpuHandleRegistry';
import { attachLabelDirectors } from '../wiring/attachLabelDirectors';

import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { BootstrapDeps } from '../../../@types/engine/BootstrapDeps';
import type { GpuHandleConstructDeps } from '../../../@types/engine/handles/GpuHandleConstructDeps';
import type { GpuHandleRow } from '../../../@types/engine/handles/GpuHandleRow';

/**
 * Bootstrap phase 1: writes every `GPU_HANDLE_ROWS` handle except the `'wireInput'`
 * rows (`pickProgram`). Mints no asset slot. Stashes `device`/`context`/`format`/
 * `unwatchHdrCapability` on `deps.phaseLocals` for `createLayers` and `destroy()`.
 */
export async function initGpu(state: EngineState, deps: BootstrapDeps): Promise<void> {
  const { canvas } = deps;

  // Sync the backing store first — otherwise `getCurrentTexture()` may return a 300×150 default.
  resizeCanvasToDisplay(canvas);

  const { device, context, format, hdrCapable } = await gpuInitGpu(canvas);
  state.gpu.memory = trackGpuMemory(device);

  // Assigned now so a later throw still lets `destroy()` remove the HDR listener.
  deps.cb.store.dispatch(engineHdrCapabilityChanged(hdrCapable));
  const unwatchHdrCapability = watchHdrCapability((capable) =>
    deps.cb.store.dispatch(engineHdrCapabilityChanged(capable)),
  );
  deps.phaseLocals = { device, context, format, unwatchHdrCapability };

  // fadeBgl/sourceBgl/focusBgl/timingService/uiCtx/fontAtlases/envBrdfLut: the
  // 7 `GpuHandleKey`-excluded state.gpu fields (see GpuHandleKey.d.ts) — built
  // here, not as rows. All but uiCtx/timingService also feed `handleDeps` below.
  state.gpu.fadeBgl = createFadeUniformsBgl(device);
  state.gpu.sourceBgl = createSourceUniformsBgl(device);
  state.gpu.focusBgl = createFocusUniformsBgl(device);

  // No-ops unless `?gpuTimings`/`?perf` AND `timestamp-query` support.
  state.gpu.timingService = createGpuTimingService(
    device,
    hasUrlGate('gpuTimings') || isPerfMode(),
    TIMED_SLOTS,
  );

  state.gpu.uiCtx = { device, context, canvas, hdrCapable };
  // In parallel, with the manifest `wireSlots` awaits already on its way: each
  // serial request costs a round trip, ~0.3 s apiece on a slow mobile link.
  void loadDataManifest();
  [state.gpu.fontAtlases, state.gpu.envBrdfLut] = await Promise.all([
    loadFontAtlases(),
    loadEnvBrdfLut(device),
  ]);

  const handleDeps: GpuHandleConstructDeps = {
    ctx: { device, context, canvas, format, hdrCapable },
    fadeBgl: state.gpu.fadeBgl!,
    sourceBgl: state.gpu.sourceBgl!,
    focusBgl: state.gpu.focusBgl!,
    fontAtlases: state.gpu.fontAtlases!,
    envBrdfLut: state.gpu.envBrdfLut!,
  };
  constructGpuHandles(
    GPU_HANDLE_ROWS.filter((row: GpuHandleRow) => row.constructPhase !== 'wireInput'),
    state,
    handleDeps,
  );

  // `attachLabelDirectors` is shared with the later swap-format rebuild.
  attachLabelDirectors(state);
}
