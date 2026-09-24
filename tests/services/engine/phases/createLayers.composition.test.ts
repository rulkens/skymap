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
import { NEAR0, COSMO } from '../../../../src/services/engine/frame/slabs';
import { CORE_TRAIL_ELEMENTS } from '../../../../src/data/bodies/coreTrailElements';
import { CORE_SLAB_ROWS } from '../../../../src/data/bodies/coreSlabRows';
import { LAYER_SLAB_ROW_HEADROOM } from '../../../../src/data/rendering/layerSlabRowHeadroom';
import type { OrbitalElements } from '../../../../src/@types/scene/OrbitalElements';

function makeState(
  registerProducer: ReturnType<typeof vi.fn>,
  foregroundRegisterProducer: ReturnType<typeof vi.fn> = vi.fn(),
): EngineState {
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
      foregroundLabelDirector: { registerProducer: foregroundRegisterProducer },
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
    guides: () => ({
      screenLabels: [{ id: `${tag}-labels`, slab: COSMO, produceLabels: () => ({}) }],
    }),
  } as unknown as Layer<string, unknown>;
}

/** A Layer contributing only a world-space label producer, tagged `<tag>-world`. */
function worldLabelLayer(tag: string): Layer<string, unknown> {
  return {
    name: tag,
    create: () => ({}),
    destroy: () => {},
    passes: () => [],
    guides: () => ({ worldLabels: [{ id: `${tag}-world`, produceLabels3D: () => ({}) }] }),
  } as unknown as Layer<string, unknown>;
}

/** A Layer contributing `count` slab rows, anchored `<tag>-slab-<i>`. */
function slabRowLayer(tag: string, anchorIds: readonly string[]): Layer<string, unknown> {
  return {
    name: tag,
    create: () => ({}),
    destroy: () => {},
    passes: () => [],
    slabs: anchorIds.map((anchorId) => ({
      anchorId,
      boundingRadiusM: 1,
      footprintRadiusM: 1,
      source: 'foreground' as const,
    })),
  } as unknown as Layer<string, unknown>;
}

/** A Layer contributing one orbit-trail row and nothing else. */
function orbitTrailLayer(tag: string, row: OrbitalElements): Layer<string, unknown> {
  return {
    name: tag,
    create: () => ({}),
    destroy: () => {},
    passes: () => [],
    guides: () => ({ orbitTrails: [row] }),
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

  it("composes core's orbit-trail rows then every Layer's guides.orbitTrails, in tuple order", async () => {
    const { store } = createAppStore();
    const state = makeState(vi.fn());
    const aRow = { id: 'a-trail' } as unknown as OrbitalElements;
    const bRow = { id: 'b-trail' } as unknown as OrbitalElements;
    const layers = [orbitTrailLayer('a', aRow), orbitTrailLayer('b', bRow)];

    await createLayers(state, makeDeps(layers, store));

    // By reference, row for row: a structural compare would pass a copy that lost
    // the identity `orbitTrailsPass` walks.
    const expected = [...CORE_TRAIL_ELEMENTS, aRow, bRow];
    expect(state.orbitTrailRows).toHaveLength(expected.length);
    expected.forEach((row, i) => expect(state.orbitTrailRows[i]).toBe(row));
  });

  it('composes Layer world label producers onto state.label3DProducers', async () => {
    const { store } = createAppStore();
    const state = makeState(vi.fn());
    const layers = [worldLabelLayer('a'), worldLabelLayer('b')];

    await createLayers(state, makeDeps(layers, store));

    expect(state.label3DProducers.map((producer) => producer.id)).toEqual(['a-world', 'b-world']);
  });

  it("composes CORE_SLAB_ROWS then every Layer's slabs, in tuple order", async () => {
    const { store } = createAppStore();
    const state = makeState(vi.fn());
    const layers = [slabRowLayer('a', ['a-anchor']), slabRowLayer('b', ['b-anchor'])];

    await createLayers(state, makeDeps(layers, store));

    expect(state.slabRows.map((row) => row.anchorId)).toEqual([
      ...CORE_SLAB_ROWS.map((row) => row.anchorId),
      'a-anchor',
      'b-anchor',
    ]);
  });

  it('throws at boot when a composition’s slab rows exceed the ceiling', async () => {
    const { store } = createAppStore();
    const state = makeState(vi.fn());
    // One past the headroom, counting core's own rows — the GPU query set is
    // already sized, so the overflow row would draw into nothing.
    const anchorIds = Array.from(
      { length: LAYER_SLAB_ROW_HEADROOM - CORE_SLAB_ROWS.length + 1 },
      (_, k) => `over-${k}`,
    );

    await expect(
      createLayers(state, makeDeps([slabRowLayer('over', anchorIds)], store)),
    ).rejects.toThrow(/slab rows exceed LAYER_SLAB_ROW_HEADROOM/);
  });

  it('throws at boot when two Layers name the same slab anchorId', async () => {
    const { store } = createAppStore();
    const state = makeState(vi.fn());
    const layers = [slabRowLayer('a', ['shared-anchor']), slabRowLayer('b', ['shared-anchor'])];

    await expect(createLayers(state, makeDeps(layers, store))).rejects.toThrow(/shared-anchor/);
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
    const layer = contributingLayer('a', 'structureCatalog', () => ({}));

    await expect(createLayers(state, makeDeps([layer], store))).rejects.toThrow(/structureCatalog/);
  });

  it('routes a screen label producer to the director owning its named slab, and throws for one naming an unknown slab', async () => {
    const { store } = createAppStore();
    const cosmoRegisterProducer = vi.fn();
    const foregroundRegisterProducer = vi.fn();
    const nearLayer = {
      name: 'near',
      create: () => ({}),
      destroy: () => {},
      passes: () => [],
      guides: () => ({
        screenLabels: [{ id: 'near-label', slab: NEAR0, produceLabels: () => ({}) }],
      }),
    } as unknown as Layer<string, unknown>;

    await createLayers(
      makeState(cosmoRegisterProducer, foregroundRegisterProducer),
      makeDeps([nearLayer], store),
    );

    expect(foregroundRegisterProducer.mock.calls.map(([producer]) => producer.id)).toEqual([
      'near-label',
    ]);
    expect(cosmoRegisterProducer).not.toHaveBeenCalled();

    const bodySlabLayer = {
      name: 'body',
      create: () => ({}),
      destroy: () => {},
      passes: () => [],
      guides: () => ({ screenLabels: [{ id: 'body-label', slab: 2, produceLabels: () => ({}) }] }),
    } as unknown as Layer<string, unknown>;

    await expect(
      createLayers(makeState(vi.fn()), makeDeps([bodySlabLayer], store)),
    ).rejects.toThrow(/BODY\[0\]/);
  });
});
