/**
 * createLayers — focused tests for the D7 phase: the four core objects a
 * Layer's `create` receives, tuple-order construction, the facts-seeded-
 * before-create sequencing (Ruling 7), and the boot-time disjointness check.
 */

import { describe, it, expect, vi } from 'vitest';
import { createLayers } from '../../../../src/services/engine/phases/createLayers';
import { createAppStore } from '../../../../src/store/createAppStore';
import { factsReported, layerFactsSeeded } from '../../../../src/state/engine/engineSlice';
import type { Layer } from '../../../../src/@types/engine/layer/Layer';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { BootstrapDeps } from '../../../../src/@types/engine/BootstrapDeps';
import type { LayerCoreDeps } from '../../../../src/@types/engine/layer/LayerCoreDeps';

function makeState(): EngineState {
  return {
    gpu: {
      fadeBgl: { __tag: 'fadeBgl' },
      sourceBgl: { __tag: 'sourceBgl' },
      focusBgl: { __tag: 'focusBgl' },
      focusUniform: { __tag: 'focusUniform' },
      uiCtx: { device: {}, context: {}, canvas: {}, hdrCapable: true },
    },
    subsystems: {
      fades: { __tag: 'fades' },
      scheduler: { requestRender: vi.fn() },
    },
    layers: [],
    selectionKindRows: [{ type: 'milkyWay', pickSources: [] } as never],
  } as unknown as EngineState;
}

function makeDeps(
  layers: readonly Layer<string, unknown>[],
  store: ReturnType<typeof createAppStore>['store'],
): BootstrapDeps {
  return {
    canvas: { __tag: 'canvas' } as unknown as HTMLCanvasElement,
    cb: { store, setSagaContext: vi.fn() },
    composition: { layers, home: { focus: null, seedSelection: false } },
    frameRef: { current: () => {} },
    detachControlsRef: { current: null },
    handleRef: { current: null },
    allSlots: new Map(),
    phaseLocals: {
      device: {} as GPUDevice,
      context: {} as GPUCanvasContext,
      format: 'bgra8unorm' as GPUTextureFormat,
      unwatchHdrCapability: () => {},
    },
  } as unknown as BootstrapDeps;
}

function stubLayer(
  name: string,
  opts: Partial<Layer<string, { name: string }>> = {},
): Layer<string, { name: string }> {
  return {
    name,
    create: () => ({ name }),
    destroy: () => {},
    passes: () => [],
    ...opts,
  };
}

describe('createLayers', () => {
  it('hands every Layer the four core objects', async () => {
    const { store } = createAppStore();
    let received: LayerCoreDeps<undefined> | undefined;
    const layer = stubLayer('stub', {
      create: (deps) => {
        received = deps;
        return { name: 'stub' };
      },
    });
    const state = makeState();
    const deps = makeDeps([layer], store);

    await createLayers(state, deps);

    expect(received?.focusUniform).toBe(state.gpu.focusUniform);
    expect(received?.fades).toBe(state.subsystems.fades);

    received!.reportSourceCount(1 as never, 5);
    expect(store.getState().engine.sourceCounts[1 as never]).toBe(5);
  });

  it('creates in tuple order and stores instances in that order', async () => {
    const { store } = createAppStore();
    const order: string[] = [];
    const layerA = stubLayer('a', { create: () => (order.push('a'), { name: 'a' }) });
    const layerB = stubLayer('b', { create: () => (order.push('b'), { name: 'b' }) });
    const state = makeState();

    await createLayers(state, makeDeps([layerA, layerB], store));

    expect(order).toEqual(['a', 'b']);
    expect(state.layers.map((i) => i.name)).toEqual(['a', 'b']);
  });

  it("a Layer's facts are seeded before its create runs, and publish merges into the seed", async () => {
    const { store } = createAppStore();
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    const layer = {
      name: 'stub',
      facts: { count: 0 },
      create: (deps: LayerCoreDeps<{ count: number }>) => {
        deps.publish({ count: 7 });
        return { name: 'stub' };
      },
      destroy: () => {},
      passes: () => [],
    } as unknown as Layer<string, unknown>;
    const state = makeState();

    await createLayers(state, makeDeps([layer], store));

    const seedIndex = dispatchSpy.mock.calls.findIndex((c) => layerFactsSeeded.match(c[0]));
    const createIndex = dispatchSpy.mock.calls.findIndex((c) => factsReported.match(c[0]));
    expect(seedIndex).toBeGreaterThanOrEqual(0);
    expect(createIndex).toBeGreaterThan(seedIndex);
    expect((store.getState().engine as unknown as { stub: { count: number } }).stub).toEqual({
      count: 7,
    });
  });

  it('throws at boot when two rows share a pick source code', async () => {
    const { store } = createAppStore();
    const state = makeState();
    state.selectionKindRows = [{ type: 'body', pickSources: [1] } as never];
    const layer = stubLayer('stub', {
      selection: () => [{ type: 'galaxy', pickSources: [1] } as never],
    });

    await expect(createLayers(state, makeDeps([layer], store))).rejects.toThrow();
  });
});
