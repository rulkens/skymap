// @vitest-environment jsdom

/**
 * engine.destroy — Layer teardown order (D8). `runBootstrapPhases` and
 * `destroyGpuHandles` are mocked wholesale so this exercises only `engine.ts`'s
 * own synchronous `destroy()` body against two stub `LayerInstance`s injected
 * via the mocked bootstrap — the real async GPU bootstrap never runs in Node.
 */

import { describe, it, expect, vi } from 'vitest';

const order: string[] = [];

vi.mock('../../../src/services/engine/phases/bootstrap', () => ({
  runBootstrapPhases: vi.fn(async (state: { layers: unknown[] }) => {
    state.layers = [
      { name: 'a', selection: [], frame: null, destroy: () => order.push('destroy:a') },
      { name: 'b', selection: [], frame: null, destroy: () => order.push('destroy:b') },
    ];
  }),
}));

vi.mock('../../../src/services/engine/gpuHandles/destroyGpuHandles', () => ({
  destroyGpuHandles: vi.fn(() => order.push('destroyGpuHandles')),
}));

import { createEngine } from '../../../src/services/engine/engine';
import { createAppStore } from '../../../src/store/createAppStore';
import { makeSettingsFixture } from '../../state/settings/makeSettingsFixture';
import { STUB_COMPOSITION } from '../../helpers/engine/stubComposition';
import type { EngineCallbacks } from '../../../src/@types/engine/EngineCallbacks';

describe('engine.destroy — Layer teardown order (D8)', () => {
  it('destroys Layers in reverse tuple order before core teardown', () => {
    order.length = 0;
    const canvas = {} as unknown as HTMLCanvasElement;
    const { store } = createAppStore({ settings: makeSettingsFixture() });
    const cb: EngineCallbacks = { store, setSagaContext: vi.fn(), runSaga: vi.fn() };

    // The mocked runBootstrapPhases has no internal `await`, so its body — and
    // the state.layers write — runs synchronously within this call, before the
    // enclosing async IIFE's `await` ever suspends.
    const handle = createEngine(canvas, cb, STUB_COMPOSITION);

    handle.destroy();

    expect(order).toEqual(['destroy:b', 'destroy:a', 'destroyGpuHandles']);
  });
});
