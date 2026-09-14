import type { EngineGpuHandles } from './EngineGpuHandles';

// The 7 excluded fields are NOT Disposable / not GPU_HANDLE_ROWS rows — see
// the plan's "out of scope" section for why each is excluded. pickRenderer
// / pickProgram ARE covered (rows constructed from wireInput.ts, not
// initGpu.ts — see the "in scope, later phase" note). `envBrdfLut` is a row's
// INPUT, not a row: a row's `construct` is synchronous and the LUT arrives
// from a fetch, so `initGpu` awaits it and `engine.destroy()` releases it.
export type GpuHandleKey = Exclude<
  keyof EngineGpuHandles,
  'fadeBgl' | 'sourceBgl' | 'focusBgl' | 'fontAtlases' | 'envBrdfLut' | 'uiCtx' | 'timingService'
>;
