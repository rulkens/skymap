/**
 * destroyGpuHandles — the generic GPU-handle-row teardown walker. Pins down
 * the two properties `GPU_HANDLE_ROWS` depends on at teardown: REVERSE-order
 * execution (later-constructed handles may depend on earlier ones, so they
 * must go first) and null-safety when a handle never got constructed.
 */

import { describe, it, expect } from 'vitest';

import { destroyGpuHandles } from '../../../../src/services/engine/gpuHandles/destroyGpuHandles';
import type { GpuHandleRow } from '../../../../src/@types/engine/handles/GpuHandleRow';
import type { EngineGpuHandles } from '../../../../src/@types/engine/handles/EngineGpuHandles';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';

// The walker only ever touches `state.gpu`; a minimal stub is sufficient
// (same rationale as constructGpuHandles.test.ts).
function makeState(gpu: Partial<EngineGpuHandles>): EngineState {
  return { gpu: gpu as EngineGpuHandles } as unknown as EngineState;
}

// `construct` is never called by destroyGpuHandles; only `key` matters here.
// One cast at the array level, since `GpuHandleRow['construct']` indexes the
// union and no single row literal can satisfy every member's signature.
const rows = [
  { key: 'galaxyPointRenderer', construct: () => {} },
  { key: 'galaxyPickRenderer', construct: () => {} },
  { key: 'compositor', construct: () => {} },
] as unknown as GpuHandleRow[];

describe('destroyGpuHandles', () => {
  it('destroys handles in reverse declared order', () => {
    const destroyed: string[] = [];
    const state = makeState({
      galaxyPointRenderer: { destroy: () => destroyed.push('galaxyPointRenderer') } as unknown as EngineGpuHandles['galaxyPointRenderer'],
      galaxyPickRenderer: {
        destroy: () => destroyed.push('galaxyPickRenderer'),
      } as unknown as EngineGpuHandles['galaxyPickRenderer'],
      compositor: {
        destroy: () => destroyed.push('compositor'),
      } as unknown as EngineGpuHandles['compositor'],
    });

    destroyGpuHandles(rows, state);

    expect(destroyed).toEqual(['compositor', 'galaxyPickRenderer', 'galaxyPointRenderer']);
  });

  it('nulls every destroyed field', () => {
    const state = makeState({
      galaxyPointRenderer: { destroy: () => {} } as unknown as EngineGpuHandles['galaxyPointRenderer'],
      galaxyPickRenderer: { destroy: () => {} } as unknown as EngineGpuHandles['galaxyPickRenderer'],
      compositor: { destroy: () => {} } as unknown as EngineGpuHandles['compositor'],
    });

    destroyGpuHandles(rows, state);

    expect(state.gpu.galaxyPointRenderer).toBeNull();
    expect(state.gpu.galaxyPickRenderer).toBeNull();
    expect(state.gpu.compositor).toBeNull();
  });

  it('skips an already-null handle without throwing', () => {
    let compositorDestroyCalled = false;
    const state = makeState({
      galaxyPointRenderer: { destroy: () => {} } as unknown as EngineGpuHandles['galaxyPointRenderer'],
      galaxyPickRenderer: null,
      compositor: {
        destroy: () => {
          compositorDestroyCalled = true;
        },
      } as unknown as EngineGpuHandles['compositor'],
    });

    expect(() => destroyGpuHandles(rows, state)).not.toThrow();

    // The assertion above already proves `null.destroy()` was never reached
    // (it would throw); this just documents that unrelated handles were
    // unaffected by the skip.
    expect(compositorDestroyCalled).toBe(true);
    expect(state.gpu.galaxyPickRenderer).toBeNull();
  });
});
