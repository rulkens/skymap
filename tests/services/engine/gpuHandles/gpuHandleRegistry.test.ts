/**
 * gpuHandleRegistry — integration tests one layer above the generic walker
 * tests (constructGpuHandles.test.ts / destroyGpuHandles.test.ts): a
 * construct-then-destroy round-trip against the REAL 44-row GPU_HANDLE_ROWS
 * table (every key torn down exactly once, structurally — no per-name
 * update needed when a row is added), the one proven teardown-order
 * constraint (focusUniform outlives galaxyPickRenderer, whose bind group it
 * supplies at construction), and the one row with real boot-time logic
 * beyond a bare factory call (starPointRenderer's epoch-derived seed).
 */

import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../../src/services/gpu/renderers/bodies/starPointRenderer', () => ({
  createStarPointRenderer: vi.fn(() => ({ setStars: vi.fn(), destroy: vi.fn() })),
}));

import { constructGpuHandles } from '../../../../src/services/engine/gpuHandles/constructGpuHandles';
import { destroyGpuHandles } from '../../../../src/services/engine/gpuHandles/destroyGpuHandles';
import { GPU_HANDLE_ROWS } from '../../../../src/services/engine/gpuHandles/gpuHandleRegistry';
import { createStarPointRenderer } from '../../../../src/services/gpu/renderers/bodies/starPointRenderer';
import { createEngineData } from '../../../../src/services/engine/data/createEngineData';
import { deriveBodyStates } from '../../../../src/services/engine/frame/deriveBodyStates';
import { CONST_J2000 } from '../../../../src/data/time/constJ2000';
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

  it('destroys focusUniform last, strictly after galaxyPickRenderer', () => {
    const order: GpuHandleKey[] = [];
    const rows = stubbedRows((key) => order.push(key));
    const state = makeState();

    constructGpuHandles(rows, state, deps);
    destroyGpuHandles(rows, state);

    // galaxyPickRenderer captures focusUniform's bind group at construction
    // (see gpuHandleRegistry.ts); destroying focusUniform first would leave
    // that captured reference dangling mid-teardown.
    expect(order.at(-1)).toBe('focusUniform');
    expect(order.indexOf('focusUniform')).toBeGreaterThan(order.indexOf('galaxyPickRenderer'));
  });
});

describe('GPU_HANDLE_ROWS — starPointRenderer boot seed', () => {
  it('uploads the full seeded star list at the J2000 boot epoch', () => {
    const row = GPU_HANDLE_ROWS.find((r) => r.key === 'starPointRenderer') as
      | GpuHandleRow
      | undefined;
    const state = { data: createEngineData(), gpu: {} } as unknown as EngineState;
    const realDeps = { device: {} } as unknown as GpuHandleConstructDeps;

    row!.construct(state, realDeps);

    const stub = vi.mocked(createStarPointRenderer).mock.results.at(-1)!.value as {
      setStars: ReturnType<typeof vi.fn>;
    };
    expect(stub.setStars).toHaveBeenCalledTimes(1);
    const uploaded = stub.setStars.mock.calls[0]![0] as ReadonlyArray<{
      id: string;
      positionMpc: unknown;
    }>;

    // Ground truth computed independently (not reused from the row's own
    // closure) — a wrong epoch, a dropped star, or a forgotten setStars call
    // would each show up as a mismatch here.
    const bootStates = deriveBodyStates(CONST_J2000);
    const seededStars = state.data.bodies.stars;
    expect(uploaded.map((s) => s.id)).toEqual(seededStars.map((s) => s.id));
    expect(seededStars.map((s) => s.id)).toContain('sun');
    for (const star of uploaded) {
      expect(star.positionMpc).toEqual(bootStates.get(star.id)!.positionMpc);
    }
  });
});
