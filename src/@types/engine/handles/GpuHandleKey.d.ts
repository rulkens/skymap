import type { EngineGpuHandles } from './EngineGpuHandles';

// The 6 excluded fields are NOT Disposable / not GPU_HANDLE_ROWS rows — see
// the plan's "out of scope" section for why each is excluded. pickRenderer
// / pickProgram ARE covered (rows constructed from wireInput.ts, not
// initGpu.ts — see the "in scope, later phase" note).
export type GpuHandleKey = Exclude<
  keyof EngineGpuHandles,
  'fadeBgl' | 'sourceBgl' | 'focusBgl' | 'fontAtlases' | 'uiCtx' | 'timingService'
>;
