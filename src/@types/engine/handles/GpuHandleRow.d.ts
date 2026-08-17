import type { GpuHandleKey } from './GpuHandleKey';
import type { GpuHandleConstructDeps } from './GpuHandleConstructDeps';
import type { EngineGpuHandles } from './EngineGpuHandles';
import type { EngineState } from '../state/EngineState';

// Distributive over GpuHandleKey so `construct`'s return type is pinned to
// the EXACT field type for that key (not a union of all 44) — a row for
// 'milkyWayCloud' must return MilkyWayCloud, not MilkyWayCloud | RenderTargets | ...
export type GpuHandleRow = {
  [K in GpuHandleKey]: {
    readonly key: K;
    readonly construct: (
      state: EngineState,
      deps: GpuHandleConstructDeps,
    ) => NonNullable<EngineGpuHandles[K]>;
    readonly rebuildOnSwapFormat?: true;
  };
}[GpuHandleKey];
