/**
 * initGpu — bootstrap phase that acquires the WebGPU device + swap-chain context,
 * builds the shared BGL/uiCtx/fontAtlases prerequisites, then constructs every GPU
 * handle via `constructGpuHandles`/`GPU_HANDLE_ROWS` (see `../gpuHandles/`). Runs
 * first because every later phase needs the device.
 *
 * `device` / `context` survive past this phase via the `phaseLocals` carrier (see
 * `BootstrapDeps`); `state.gpu.uiCtx` is a narrower home for the same two values +
 * `canvas`, also read by `applySwapFormat`/`buildSwapRenderers` on a later rebuild.
 */

import { initGpu as gpuInitGpu, resizeCanvasToDisplay, watchHdrCapability } from '../../gpu/device';
import { createGpuTimingService } from '../../gpu/timing/gpuTimingService';
import { TIMED_SLOTS } from '../frame/frameProgram';
import { loadFontAtlases } from '../../gpu/labelLayout/loadFontAtlases';
import { engineHdrCapabilityChanged } from '../../../state/engine/engineSlice';
import { hasUrlGate } from '../../../utils/url/hasUrlGate';
import { isPerfMode } from '../../../utils/url/isPerfMode';
import { createFadeUniformsBgl } from '../../gpu/bindGroupLayouts/fadeUniforms';
import { createSourceUniformsBgl } from '../../gpu/bindGroupLayouts/sourceUniforms';
import { createFocusUniformsBgl } from '../../gpu/bindGroupLayouts/focusUniforms';
import { constructGpuHandles } from '../gpuHandles/constructGpuHandles';
import { GPU_HANDLE_ROWS } from '../gpuHandles/gpuHandleRegistry';

import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { BootstrapDeps } from '../../../@types/engine/BootstrapDeps';
import type { GpuHandleConstructDeps } from '../../../@types/engine/handles/GpuHandleConstructDeps';

/**
 * Bootstrap phase 1: GPU device acquisition + renderer construction. Writes
 * every `GPU_HANDLE_ROWS`-owned handle except the `constructPhase: 'wireInput'`
 * rows (`galaxyPickRenderer`/`pickProgram`, built by `wireInput` once
 * `focusUniform` exists). Mints no `state.assetSlots.*` — those are minted
 * in `wireSlots`. Stashes `device`/`context`/`unwatchHdrCapability` on
 * `deps.phaseLocals` so `engine.ts`'s `destroy()` can remove the HDR listener.
 */
export async function initGpu(state: EngineState, deps: BootstrapDeps): Promise<void> {
  const { canvas } = deps;

  // Sync the backing store first — otherwise `getCurrentTexture()` may return a 300×150 default.
  resizeCanvasToDisplay(canvas);

  const { device, context, format, hdrCapable } = await gpuInitGpu(canvas);

  // Assigned now, not at the end of this throw-capable phase, so a later
  // throw still lets `destroy()` remove the HDR listener rather than leak it.
  deps.cb.store.dispatch(engineHdrCapabilityChanged(hdrCapable));
  const unwatchHdrCapability = watchHdrCapability((capable) =>
    deps.cb.store.dispatch(engineHdrCapabilityChanged(capable)),
  );
  deps.phaseLocals = { device, context, unwatchHdrCapability };

  // fadeBgl/sourceBgl/focusBgl/timingService/uiCtx/fontAtlases: the 6
  // `GpuHandleKey`-excluded state.gpu fields (see GpuHandleKey.d.ts) — built
  // here, not as rows. fadeBgl/sourceBgl/focusBgl/fontAtlases also feed
  // `handleDeps` below; uiCtx/timingService don't.
  state.gpu.fadeBgl = createFadeUniformsBgl(device);
  state.gpu.sourceBgl = createSourceUniformsBgl(device);
  state.gpu.focusBgl = createFocusUniformsBgl(device);

  // No-ops unless `?gpuTimings`/`?perf` AND `timestamp-query` support.
  state.gpu.timingService = createGpuTimingService(
    device,
    hasUrlGate('gpuTimings') || isPerfMode(),
    TIMED_SLOTS,
  );

  // Sequenced here, before `constructGpuHandles`, exactly as it always ran.
  state.gpu.uiCtx = { device, context, canvas, hdrCapable };
  state.gpu.fontAtlases = await loadFontAtlases();

  const handleDeps: GpuHandleConstructDeps = {
    ctx: { device, context, canvas, format, hdrCapable },
    fadeBgl: state.gpu.fadeBgl!,
    sourceBgl: state.gpu.sourceBgl!,
    focusBgl: state.gpu.focusBgl!,
    fontAtlases: state.gpu.fontAtlases!,
  };
  // Complement of wireInput.ts's filter below, by construction: this phase
  // builds every row EXCEPT the ones marked `constructPhase: 'wireInput'`.
  constructGpuHandles(
    GPU_HANDLE_ROWS.filter((row) => !('constructPhase' in row)),
    state,
    handleDeps,
  );

  // Post-construction wiring, now reading the walker's output off state.gpu:
  state.subsystems.biasCorrection.attachRenderer(state.gpu.galaxyPointRenderer!);
  // Used to run inside `buildSwapRenderers`, which no longer builds at boot.
  state.subsystems.labelDirector.attachRenderers(
    state.gpu.labelRenderer!,
    state.gpu.markerLineRenderer!,
  );
}
