/**
 * createLayers — the contribution composition: core's constants first, then
 * every Layer's, in tuple order, with each asset row's slot indexed by its key
 * and no two rows claiming one slot key.
 */

import { describe, it, expect, vi } from 'vitest';
import { createLayers } from '../../../../src/services/engine/phases/createLayers';
import { createLabelDirectorState } from '../../../../src/services/engine/labels/createLabelDirectorState';
import { LABEL_DIRECTORS } from '../../../../src/data/labels/labelDirectors';
import { createAppStore } from '../../../../src/store/createAppStore';
import { CONTENT_PASSES } from '../../../../src/services/engine/frame/passes';
import type { Layer } from '../../../../src/@types/engine/layer/Layer';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { BootstrapDeps } from '../../../../src/@types/engine/BootstrapDeps';
import { NEAR0, COSMO } from '../../../../src/services/engine/frame/slabs';
import { bodyPickCodes } from '../../../support/layerPickCodes';
import { bodyLayerWithoutGpu } from '../../../helpers/engine/bodyLayerWithoutGpu';
import { missionsLayer } from '../../../../src/layers/missions/layer';
import { MISSION_CRAFT_IDS } from '../../../../src/layers/missions/craft/present/missionCraftIds';
import type { LayerCoreDeps } from '../../../../src/@types/engine/layer/LayerCoreDeps';
import { ALL_BODY_TEXTURE_KEYS } from '../../../../src/layers/body/textures/data/bodyTextureKeys';
import { bodyTextureSlotKey } from '../../../../src/layers/body/textures/load/bodyTextureSlotKey';
import { meshBodySlotKey } from '../../../../src/utils/meshBodies/meshBodySlotKey';
import { LAYER_SLAB_ROW_HEADROOM } from '../../../../src/data/rendering/layerSlabRowHeadroom';
import { datumOnlyTerrainHeight } from '../../../../src/utils/camera/terrain/datumOnlyTerrainHeight';
import { IDLE_SURFACE_TILE_PLAN } from '../../../../src/layers/body/surfaceTiles/plan/subsystems/idleSurfaceTilePlan';
import { asSceneBodyId } from '../../../../src/utils/scene/asSceneBodyId';
import type { OrbitalElements } from '../../../../src/@types/scene/OrbitalElements';
import type { LayerGuides } from '../../../../src/@types/engine/layer/LayerGuides';
import type { SampledTrailRow } from '../../../../src/@types/engine/layer/SampledTrailRow';

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
      labelDirectors: LABEL_DIRECTORS.map(createLabelDirectorState),
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
 * `slot` are separate so a test can aim two Layers at one key.
 */
function contributingLayer(tag: string, assetKey: string, slot: object): Layer<string, unknown> {
  return {
    name: tag,
    create: () => ({}),
    destroy: () => {},
    passes: () => [{ name: `${tag}-pass`, enabled: () => false, draw: () => {} }],
    assets: () => [{ key: assetKey, slot, req: () => undefined, demand: 'always', priority: 1 }],
    guides: () => ({
      screenLabels: [{ slab: COSMO, toggle: `${tag}-labels` }],
    }),
  } as unknown as Layer<string, unknown>;
}

function worldLabelLayer(tag: string): Layer<string, unknown> {
  return {
    name: tag,
    create: () => ({}),
    destroy: () => {},
    passes: () => [],
    guides: () => ({ worldLabels: [{ id: `${tag}-world`, produceLabels3D: () => ({}) }] }),
  } as unknown as Layer<string, unknown>;
}

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
    })),
  } as unknown as Layer<string, unknown>;
}

function guidesLayer(tag: string, guides: LayerGuides): Layer<string, unknown> {
  return {
    name: tag,
    create: () => ({}),
    destroy: () => {},
    passes: () => [],
    guides: () => guides,
  } as unknown as Layer<string, unknown>;
}

describe('createLayers composition', () => {
  it("composes a Layer's passes and labels after core's, and its assets in tuple order", async () => {
    const { store } = createAppStore();
    const slotA = { name: 'slot-a' };
    const slotB = { name: 'slot-b' };
    const state = makeState();
    const layers = [
      contributingLayer('a', 'a-asset', slotA),
      contributingLayer('b', 'b-asset', slotB),
    ];

    await createLayers(state, makeDeps(layers, store));

    expect(state.passes.map((pass) => pass.name)).toEqual([
      ...CONTENT_PASSES.map((pass) => pass.name),
      'a-pass',
      'b-pass',
    ]);
    expect(state.assetRows.map((row) => row.key)).toEqual(['a-asset', 'b-asset']);
    expect(state.slotsByKey.get('a-asset' as never)).toBe(slotA);
    expect(state.slotsByKey.get('b-asset' as never)).toBe(slotB);
    const cosmo = state.subsystems.labelDirectors.find((d) => d.row.slab === COSMO)!;
    expect(cosmo.sources.map((source) => source.toggle)).toEqual(['a-labels', 'b-labels']);
  });

  it("createLayers composes only the Layers' orbit-trail groups", async () => {
    const { store } = createAppStore();
    const state = makeState();
    const aRow = { id: 'a-trail' } as unknown as OrbitalElements;
    const bRow = { id: 'b-trail' } as unknown as OrbitalElements;
    const aRows = [aRow];
    const bRows = [bRow];
    const layers = [
      guidesLayer('a', { orbitTrails: { show: 'sStarTrails', rows: aRows } }),
      guidesLayer('b', { orbitTrails: { show: 'orbitTrails', rows: bRows } }),
    ];

    await createLayers(state, makeDeps(layers, store));

    // By reference, row for row: a structural compare would pass a copy that lost
    // the identity `orbitTrailsPass` walks.
    const groups = state.orbitTrailGroups;
    expect(groups).toHaveLength(2);
    expect(groups[0]!.rows).toBe(aRows);
    expect(groups[0]!.show).toBe('sStarTrails');
    expect(groups[1]!.rows).toBe(bRows);
  });

  it("createLayers composes the Layers' sampled-trail groups", async () => {
    const { store } = createAppStore();
    const state = makeState();
    const aRows: SampledTrailRow[] = [{ id: asSceneBodyId('a-craft'), color: [1, 0, 0] }];
    const bRows: SampledTrailRow[] = [{ id: asSceneBodyId('b-craft'), color: [0, 1, 0] }];
    const layers = [
      guidesLayer('a', { sampledTrails: { show: 'missionTrails', rows: aRows } }),
      guidesLayer('b', { sampledTrails: { show: 'orbitTrails', rows: bRows } }),
    ];

    await createLayers(state, makeDeps(layers, store));

    const groups = state.sampledTrailGroups;
    expect(groups).toHaveLength(2);
    expect(groups[0]!.rows).toBe(aRows);
    expect(groups[0]!.show).toBe('missionTrails');
    expect(groups[1]!.rows).toBe(bRows);
    expect(groups.every((group) => typeof group.fade === 'function')).toBe(true);
  });

  it('each planet is captioned once', async () => {
    const { store } = createAppStore();
    const state = makeState();

    const deps = makeDeps([bodyLayerWithoutGpu], store);
    // The body Layer publishes a `search` feed, which createLayers runs as a saga.
    (deps.cb as unknown as { runSaga: unknown }).runSaga = vi.fn();
    await createLayers(state, deps);

    const near = state.subsystems.labelDirectors.find((d) => d.row.slab === NEAR0)!;
    expect(near.sources.filter((source) => source.toggle === 'body')).toHaveLength(1);
  });

  it('body textures rank ahead of craft meshes', async () => {
    const { store } = createAppStore();
    const state = makeState();
    // The app composes missions before body, so array order alone would fetch craft meshes first.
    const missionsLayerWithoutGpu = {
      ...missionsLayer,
      create: (deps: LayerCoreDeps) => ({ meshBodies: deps.meshBodies, pickCode: 0 }),
      destroy: () => {},
    } as unknown as Layer<string, unknown>;
    const deps = makeDeps([missionsLayerWithoutGpu, bodyLayerWithoutGpu], store);
    (deps.cb as unknown as { runSaga: unknown }).runSaga = vi.fn();
    await createLayers(state, deps);

    // The queue's order: rank, then array index.
    const keys = state.assetRows
      .map((row, index) => ({ row, index }))
      .sort((a, b) => a.row.priority - b.row.priority || a.index - b.index)
      .map(({ row }) => String(row.key));
    const firstCraftMesh = Math.min(
      ...[...MISSION_CRAFT_IDS].map((id) => keys.indexOf(String(meshBodySlotKey(id)))),
    );
    const lastTexture = Math.max(
      ...ALL_BODY_TEXTURE_KEYS.map((e) =>
        keys.indexOf(String(bodyTextureSlotKey(e.bodyId, e.kind))),
      ),
    );
    expect(firstCraftMesh).toBeGreaterThan(-1);
    expect(lastTexture).toBeLessThan(firstCraftMesh);
  });

  it('composes Layer world label producers onto state.label3DProducers', async () => {
    const { store } = createAppStore();
    const state = makeState();
    const layers = [worldLabelLayer('a'), worldLabelLayer('b')];

    await createLayers(state, makeDeps(layers, store));

    expect(state.label3DProducers.map((producer) => producer.id)).toEqual(['a-world', 'b-world']);
  });

  it("composes every Layer's slabs, in tuple order", async () => {
    const { store } = createAppStore();
    const state = makeState();
    const layers = [slabRowLayer('a', ['a-anchor']), slabRowLayer('b', ['b-anchor'])];

    await createLayers(state, makeDeps(layers, store));

    expect(state.slabRows.map((row) => row.anchorId)).toEqual(['a-anchor', 'b-anchor']);
  });

  it('throws at boot when a composition’s slab rows exceed the ceiling', async () => {
    const { store } = createAppStore();
    const state = makeState();
    // One past the headroom — the GPU query set is already sized, so the
    // overflow row would draw into nothing.
    const anchorIds = Array.from({ length: LAYER_SLAB_ROW_HEADROOM + 1 }, (_, k) => `over-${k}`);

    await expect(
      createLayers(state, makeDeps([slabRowLayer('over', anchorIds)], store)),
    ).rejects.toThrow(/slab rows exceed LAYER_SLAB_ROW_HEADROOM/);
  });

  it('throws at boot when two Layers name the same slab anchorId', async () => {
    const { store } = createAppStore();
    const state = makeState();
    const layers = [slabRowLayer('a', ['shared-anchor']), slabRowLayer('b', ['shared-anchor'])];

    await expect(createLayers(state, makeDeps(layers, store))).rejects.toThrow(/shared-anchor/);
  });

  it('throws at boot when two Layers mint the same slot key', async () => {
    const { store } = createAppStore();
    const state = makeState();
    const layers = [
      contributingLayer('a', 'shared-asset', {}),
      contributingLayer('b', 'shared-asset', {}),
    ];

    await expect(createLayers(state, makeDeps(layers, store))).rejects.toThrow(/shared-asset/);
  });

  it('throws at boot when an asset row declares a band its entry lacks', async () => {
    const { store } = createAppStore();
    const state = makeState();
    const layer = {
      name: 'bad',
      create: () => ({}),
      destroy: () => {},
      passes: () => [],
      visibility: [{ key: 'badShow' }],
      assets: () => [
        {
          key: 'bad-asset',
          slot: {},
          req: () => undefined,
          demand: { near: { band: 'nope', edge: 'out', lead: 2, release: 4 } },
          priority: 1,
          gates: 'badShow',
        },
      ],
    } as unknown as Layer<string, unknown>;

    await expect(createLayers(state, makeDeps([layer], store))).rejects.toThrow(
      /asset row 'bad-asset'.*band 'nope'/,
    );
  });

  it('throws at boot when heightAt is provided more than once', async () => {
    const { store } = createAppStore();
    const state = makeState();
    const heightAtLayer = (tag: string) =>
      ({
        name: tag,
        create: () => ({}),
        destroy: () => {},
        passes: () => [],
        heightAt: () => datumOnlyTerrainHeight,
      }) as unknown as Layer<string, unknown>;

    await expect(
      createLayers(state, makeDeps([heightAtLayer('a'), heightAtLayer('b')], store)),
    ).rejects.toThrow(/heightAt provided twice — a and b/);
  });

  it("createLayers composes the body Layer's heightAt and no core provider", async () => {
    // Bug caught: a core tile provider left beside the body Layer's throws at boot as a
    // second ground; a dropped body row would leave the camera on the flat datum.
    const { store } = createAppStore();
    const state = makeState();
    const heightAt = vi.fn(() => 42);
    const body = {
      ...bodyLayerWithoutGpu,
      create: () => ({
        textureSlots: new Map(),
        atlasSlot: {},
        pickCodes: bodyPickCodes(),
        surfaceTiles: { stream: { heightAt }, plan: IDLE_SURFACE_TILE_PLAN },
      }),
    } as unknown as Layer<string, unknown>;
    const deps = makeDeps([body], store);
    (deps.cb as unknown as { runSaga: unknown }).runSaga = vi.fn();

    await createLayers(state, deps);

    expect(state.terrainHeightAt(asSceneBodyId('earth'), [1, 0, 0])).toBe(42);
    expect(heightAt).toHaveBeenCalledTimes(1);
  });

  it('routes a label source to the director owning its named slab, and throws for one naming an unknown slab', async () => {
    const { store } = createAppStore();
    const nearLayer = {
      name: 'near',
      create: () => ({}),
      destroy: () => {},
      passes: () => [],
      guides: () => ({
        screenLabels: [{ slab: NEAR0, toggle: 'near-label' }],
      }),
    } as unknown as Layer<string, unknown>;

    const state = makeState();
    await createLayers(state, makeDeps([nearLayer], store));

    const sourcesOf = (slab: number) =>
      state.subsystems.labelDirectors
        .find((d) => d.row.slab === slab)!
        .sources.map((source) => source.toggle);
    expect(sourcesOf(NEAR0)).toEqual(['near-label']);
    expect(sourcesOf(COSMO)).toEqual([]);

    const bodySlabLayer = {
      name: 'body',
      create: () => ({}),
      destroy: () => {},
      passes: () => [],
      guides: () => ({ screenLabels: [{ slab: 2, toggle: 'body-label' }] }),
    } as unknown as Layer<string, unknown>;

    await expect(createLayers(makeState(), makeDeps([bodySlabLayer], store))).rejects.toThrow(
      /BODY\[0\]/,
    );
  });
});
