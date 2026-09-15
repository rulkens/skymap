/**
 * createLayers — the catalog-landed pulse core hands every Layer: the count
 * report, the content-version bump the sky capture re-bakes on, and the splash's
 * running-total ready echo (Rulings 3, 13).
 */

import { describe, it, expect, vi } from 'vitest';
import { createLayers } from '../../../../src/services/engine/phases/createLayers';
import { createAppStore } from '../../../../src/store/createAppStore';
import {
  engineSourceCountReported,
  engineStatusChanged,
} from '../../../../src/state/engine/engineSlice';
import { Source } from '../../../../src/data/sources';
import type { Layer } from '../../../../src/@types/engine/layer/Layer';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { BootstrapDeps } from '../../../../src/@types/engine/BootstrapDeps';
import type { LayerCoreDeps } from '../../../../src/@types/engine/layer/LayerCoreDeps';

function makeState(): EngineState {
  return {
    gpu: {
      fadeBgl: {},
      sourceBgl: {},
      focusBgl: {},
      focusUniform: {},
      uiCtx: { device: {}, context: {}, canvas: {}, hdrCapable: true },
    },
    subsystems: {
      fades: {},
      scheduler: { requestRender: vi.fn() },
      cosmoLabelDirector: { registerProducer: vi.fn() },
    },
    contentVersion: 0,
    layers: [],
    selectionKindRows: [],
  } as unknown as EngineState;
}

function makeDeps(
  layers: readonly Layer<string, unknown>[],
  store: ReturnType<typeof createAppStore>['store'],
): BootstrapDeps {
  return {
    canvas: {},
    cb: { store, setSagaContext: vi.fn() },
    composition: { layers, home: { focus: null, seedSelection: false } },
    frameRef: { current: () => {} },
    allSlots: new Map(),
    phaseLocals: { device: {}, context: {}, format: 'bgra8unorm' },
  } as unknown as BootstrapDeps;
}

describe('createLayers reportSourceCount', () => {
  it('reports the count, bumps the content version and echoes a running-total ready status', async () => {
    const { store } = createAppStore();
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    let report: LayerCoreDeps['reportSourceCount'] | undefined;
    const layer = {
      name: 'stub',
      create: (deps: LayerCoreDeps) => {
        report = deps.reportSourceCount;
        return {};
      },
      destroy: () => {},
      passes: () => [],
    } as unknown as Layer<string, unknown>;
    const state = makeState();

    await createLayers(state, makeDeps([layer], store));
    dispatchSpy.mockClear();

    report!(Source.SDSS, 3);
    report!(Source.TwoMRS, 4);
    report!(Source.Glade, 0);

    const counts = dispatchSpy.mock.calls
      .map(([action]) => action)
      .filter(engineSourceCountReported.match)
      .map((action) => action.payload);
    expect(counts).toEqual([
      { source: Source.SDSS, count: 3 },
      { source: Source.TwoMRS, count: 4 },
      { source: Source.Glade, count: 0 },
    ]);
    expect(state.contentVersion).toBe(3);

    const statuses = dispatchSpy.mock.calls
      .map(([action]) => action)
      .filter(engineStatusChanged.match)
      .map((action) => action.payload);
    expect(statuses).toEqual([
      { kind: 'ready', count: 3, source: Source.SDSS },
      { kind: 'ready', count: 7, source: Source.TwoMRS },
    ]);
  });
});
