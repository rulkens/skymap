/**
 * constructGpuHandles — the generic GPU-handle-row walker. Pins down the
 * two properties `GPU_HANDLE_ROWS` depends on: array-order execution, and
 * a later row seeing an earlier row's constructed value already sitting on
 * `state.gpu` (the `starCatalogRenderer` -> `starCatalogPickRenderer`
 * dependency this walker must support).
 */

import { describe, it, expect } from 'vitest';

import { constructGpuHandles } from '../../../../src/services/engine/gpuHandles/constructGpuHandles';
import type { GpuHandleRow } from '../../../../src/@types/engine/handles/GpuHandleRow';
import type { GpuHandleConstructDeps } from '../../../../src/@types/engine/handles/GpuHandleConstructDeps';
import type { EngineGpuHandles } from '../../../../src/@types/engine/handles/EngineGpuHandles';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';

// The walker only ever touches `state.gpu`; a minimal stub is sufficient
// (same rationale as tests/services/engine/helpers/engineReady.test.ts).
function makeState(): EngineState {
  return { gpu: {} as EngineGpuHandles } as unknown as EngineState;
}

const deps = {} as unknown as GpuHandleConstructDeps;

describe('constructGpuHandles', () => {
  it("calls each row's construct in declared order", () => {
    const order: string[] = [];
    const state = makeState();
    const rows: GpuHandleRow[] = [
      {
        key: 'renderer',
        construct: (): NonNullable<EngineGpuHandles['renderer']> => {
          order.push('renderer');
          return {} as unknown as NonNullable<EngineGpuHandles['renderer']>;
        },
      },
      {
        key: 'pickRenderer',
        construct: (): NonNullable<EngineGpuHandles['pickRenderer']> => {
          order.push('pickRenderer');
          return {} as unknown as NonNullable<EngineGpuHandles['pickRenderer']>;
        },
      },
      {
        key: 'compositor',
        construct: (): NonNullable<EngineGpuHandles['compositor']> => {
          order.push('compositor');
          return {} as unknown as NonNullable<EngineGpuHandles['compositor']>;
        },
      },
    ];

    constructGpuHandles(rows, state, deps);

    expect(order).toEqual(['renderer', 'pickRenderer', 'compositor']);
  });

  it("lets a later row read an earlier row's constructed value off state.gpu", () => {
    const state = makeState();
    const starCatalogRendererStub = {
      marker: 'starCatalogRenderer-stub',
    } as unknown as NonNullable<EngineGpuHandles['starCatalogRenderer']>;
    const rows: GpuHandleRow[] = [
      {
        key: 'starCatalogRenderer',
        construct: (): NonNullable<EngineGpuHandles['starCatalogRenderer']> =>
          starCatalogRendererStub,
      },
      {
        key: 'starCatalogPickRenderer',
        construct: (s): NonNullable<EngineGpuHandles['starCatalogPickRenderer']> => {
          // The load-bearing assertion: row 2 sees row 1's result already
          // committed to state.gpu, not null/undefined.
          expect(s.gpu.starCatalogRenderer).toBe(starCatalogRendererStub);
          return {} as unknown as NonNullable<EngineGpuHandles['starCatalogPickRenderer']>;
        },
      },
    ];

    constructGpuHandles(rows, state, deps);

    expect(state.gpu.starCatalogRenderer).toBe(starCatalogRendererStub);
  });
});
