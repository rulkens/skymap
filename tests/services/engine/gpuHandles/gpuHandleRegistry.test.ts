/**
 * gpuHandleRegistry — integration tests one layer above the generic walker
 * tests: a construct-then-destroy round-trip against the REAL 37-row
 * GPU_HANDLE_ROWS table (every key torn down exactly once), a key-
 * uniqueness check (a duplicate row overwrites+leaks silently — the
 * round-trip alone can't see it), and the one proven teardown-order
 * constraint (focusUniform outlives the wireInput-phase rows, whose bind
 * group it supplies at construction). The starCatalog Layer's own
 * construction-order and boot-seed behaviour moved with it into
 * `layers/starCatalog/create.ts`.
 */

import { describe, it, expect } from 'vitest';

import { constructGpuHandles } from '../../../../src/services/engine/gpuHandles/constructGpuHandles';
import { destroyGpuHandles } from '../../../../src/services/engine/gpuHandles/destroyGpuHandles';
import { GPU_HANDLE_ROWS } from '../../../../src/services/engine/gpuHandles/gpuHandleRegistry';
import type { GpuHandleRow } from '../../../../src/@types/engine/handles/GpuHandleRow';
import type { GpuHandleKey } from '../../../../src/@types/engine/handles/GpuHandleKey';
import type { GpuHandleConstructDeps } from '../../../../src/@types/engine/handles/GpuHandleConstructDeps';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';

function makeState(): EngineState {
  return { gpu: {} } as unknown as EngineState;
}

const deps = {} as unknown as GpuHandleConstructDeps;

// Same 44 keys, same declared order as GPU_HANDLE_ROWS, but every
// `construct` is a spy stub instead of a real WebGPU factory call — proves
// the walkers round-trip the WHOLE real table without needing 44 real
// renderer mocks (that cost is exactly why the file this replaces existed).
function stubbedRows(onDestroy: (key: GpuHandleKey) => void): GpuHandleRow[] {
  return GPU_HANDLE_ROWS.map((row) => ({
    key: row.key,
    construct: () => ({ destroy: () => onDestroy(row.key) }),
  })) as unknown as GpuHandleRow[];
}

describe('GPU_HANDLE_ROWS — construct/destroy round-trip', () => {
  it('destroys every one of the 44 rows exactly once', () => {
    const destroyCounts = new Map<GpuHandleKey, number>();
    const rows = stubbedRows((key) => destroyCounts.set(key, (destroyCounts.get(key) ?? 0) + 1));
    const state = makeState();

    constructGpuHandles(rows, state, deps);
    destroyGpuHandles(rows, state);

    for (const row of GPU_HANDLE_ROWS) {
      expect(destroyCounts.get(row.key)).toBe(1);
    }
  });

  it('declares every key exactly once', () => {
    // constructGpuHandles writes state.gpu[key] POSITIONALLY: a duplicated
    // row's second construct silently overwrites the first's stub, and
    // destroyGpuHandles' null-guard then skips that key's second visit —
    // so a copy-pasted row leaks its first handle while the round-trip
    // test above stays green. Neither tsc's totality check (coverage only,
    // not uniqueness) nor the walkers catch this; only counting keys does.
    expect(new Set(GPU_HANDLE_ROWS.map((row) => row.key)).size).toBe(GPU_HANDLE_ROWS.length);
  });

  it('destroys focusUniform last, strictly after the wireInput-phase rows', () => {
    const order: GpuHandleKey[] = [];
    const rows = stubbedRows((key) => order.push(key));
    const state = makeState();

    constructGpuHandles(rows, state, deps);
    destroyGpuHandles(rows, state);

    // A Layer's pick renderer captures focusUniform's bind group at
    // construction, and `pickProgram` is core's own wireInput-phase row;
    // destroying focusUniform first would leave those references dangling
    // mid-teardown.
    expect(order.at(-1)).toBe('focusUniform');
    expect(order.indexOf('focusUniform')).toBeGreaterThan(order.indexOf('pickProgram'));
  });
});
