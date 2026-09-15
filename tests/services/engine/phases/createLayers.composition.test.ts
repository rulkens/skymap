/**
 * createLayers — the contribution composition: core's constants first, then
 * every Layer's, in tuple order, with each asset row's factory called exactly
 * once and no two rows claiming one slot key.
 */

import { describe, it, expect, vi } from 'vitest';
import { createLayers } from '../../../../src/services/engine/phases/createLayers';
import { createAppStore } from '../../../../src/store/createAppStore';
import { CONTENT_PASSES } from '../../../../src/services/engine/frame/passes';
import { FADE_LAYERS } from '../../../../src/services/engine/wiring/fadeLayers';
import type { Layer } from '../../../../src/@types/engine/layer/Layer';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { BootstrapDeps } from '../../../../src/@types/engine/BootstrapDeps';

function makeState(registerProducer: ReturnType<typeof vi.fn>): EngineState {
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
      cosmoLabelDirector: { registerProducer },
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

/**
 * A Layer contributing one distinctly named row of every kind. `assetKey` and
 * `factory` are separate so a test can aim two Layers at one key, or watch how
 * often the factory runs.
 */
function contributingLayer(
  tag: string,
  assetKey: string,
  factory: () => object,
): Layer<string, unknown> {
  return {
    name: tag,
    create: () => ({}),
    destroy: () => {},
    passes: () => [{ name: `${tag}-pass`, enabled: () => false, draw: () => {} }],
    assets: () => [
      { key: assetKey, factory, req: () => undefined, demand: () => false, priority: 1 },
    ],
    fades: () => [{ key: `${tag}-fade`, expand: () => [], handle: () => ({}), seed: () => 0 }],
    labels: () => [{ id: `${tag}-labels`, produceLabels: () => ({}) }],
  } as unknown as Layer<string, unknown>;
}

describe('createLayers composition', () => {
  it("composes a Layer's passes, assets, fades and labels after core's, in tuple order", async () => {
    const { store } = createAppStore();
    const registerProducer = vi.fn();
    const slotA = { name: 'slot-a' };
    const slotB = { name: 'slot-b' };
    const factoryA = vi.fn(() => slotA);
    const state = makeState(registerProducer);
    const layers = [
      contributingLayer('a', 'a-asset', factoryA),
      contributingLayer('b', 'b-asset', () => slotB),
    ];

    await createLayers(state, makeDeps(layers, store));

    expect(state.passes.map((pass) => pass.name)).toEqual([
      ...CONTENT_PASSES.map((pass) => pass.name),
      'a-pass',
      'b-pass',
    ]);
    expect(state.fadeRows.map((row) => row.key)).toEqual([
      ...FADE_LAYERS.map((row) => row.key),
      'a-fade',
      'b-fade',
    ]);
    expect(state.assetRows.map((row) => row.key).slice(-2)).toEqual(['a-asset', 'b-asset']);
    expect(state.layerSlots.get('a-asset' as never)).toBe(slotA);
    expect(state.layerSlots.get('b-asset' as never)).toBe(slotB);
    // Once at composition, never per frame: a second call mints a second
    // subscriber onto the same payload.
    expect(factoryA).toHaveBeenCalledTimes(1);
    expect(registerProducer.mock.calls.map(([producer]) => producer.id)).toEqual([
      'a-labels',
      'b-labels',
    ]);
  });

  it('throws at boot when two Layers mint the same slot key', async () => {
    const { store } = createAppStore();
    const state = makeState(vi.fn());
    const layers = [
      contributingLayer('a', 'shared-asset', () => ({})),
      contributingLayer('b', 'shared-asset', () => ({})),
    ];

    await expect(createLayers(state, makeDeps(layers, store))).rejects.toThrow(/shared-asset/);
  });

  it('throws at boot when a Layer mints a slot key core already owns', async () => {
    const { store } = createAppStore();
    const state = makeState(vi.fn());
    const layer = contributingLayer('a', 'famousGalaxiesMeta', () => ({}));

    await expect(createLayers(state, makeDeps([layer], store))).rejects.toThrow(
      /famousGalaxiesMeta/,
    );
  });
});
