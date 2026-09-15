import type { EngineGpuHandles } from './EngineGpuHandles';

// The 7 excluded fields are NOT Disposable / not GPU_HANDLE_ROWS rows — see
// the plan's "out of scope" section for why each is excluded (`envBrdfLut`'s
// reasoning is on its `EngineGpuHandles` field doc). pickRenderer /
// pickProgram ARE covered (rows constructed from wireInput.ts, not
// initGpu.ts — see the "in scope, later phase" note).
export type GpuHandleKey = Exclude<
  keyof EngineGpuHandles,
  'fadeBgl' | 'sourceBgl' | 'focusBgl' | 'fontAtlases' | 'envBrdfLut' | 'uiCtx' | 'timingService'
>;
