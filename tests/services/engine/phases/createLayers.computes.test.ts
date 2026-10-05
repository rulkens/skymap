/**
 * createLayers — compute-row composition: a shared name across composed rows
 * is caught at boot, exactly as it is for passes (`createLayers.composition.test.ts`).
 */

import { describe, it, expect, vi } from 'vitest';
import { createLayers } from '../../../../src/services/engine/phases/createLayers';
import { createAppStore } from '../../../../src/store/createAppStore';
import type { Layer } from '../../../../src/@types/engine/layer/Layer';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { BootstrapDeps } from '../../../../src/@types/engine/BootstrapDeps';

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
      foregroundLabelDirector: { registerProducer: vi.fn() },
    },
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

/** A Layer contributing one distinctly named compute row and no other rows. */
function computeLayer(name: string, computeName: string): Layer<string, unknown> {
  return {
    name,
    create: () => ({}),
    destroy: () => {},
    passes: () => [],
    computes: () => [{ name: computeName, encode: () => {} }],
  } as unknown as Layer<string, unknown>;
}

describe('createLayers computes composition', () => {
  it('throws when two composed compute rows share a name', async () => {
    const { store } = createAppStore();
    const state = makeState();
    const layers = [computeLayer('a', 'dup-compute'), computeLayer('b', 'dup-compute')];

    await expect(createLayers(state, makeDeps(layers, store))).rejects.toThrow(/dup-compute/);
  });
});
